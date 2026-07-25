from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from flask import Flask, jsonify, request
from flask_sock import Sock

app = Flask(__name__)
sock = Sock(app)

MATRIX_SIZE = 13
TOTAL_BITS = 169
RINGS = {
    "c": {"bits_por_porcion": 1, "total_bits": 1, "order": 0},
    "am": {"bits_por_porcion": 1, "total_bits": 8, "order": 1},
    "na": {"bits_por_porcion": 2, "total_bits": 16, "order": 2},
    "vi": {"bits_por_porcion": 3, "total_bits": 24, "order": 3},
    "añ": {"bits_por_porcion": 4, "total_bits": 32, "order": 4},
    "az": {"bits_por_porcion": 5, "total_bits": 40, "order": 5},
    "m": {"bits_por_porcion": 6, "total_bits": 48, "order": 6},
}
ORDER = ["c", "am", "na", "vi", "añ", "az", "m"]


@dataclass
class MFNSprite:
    estado: list[int] = field(default_factory=lambda: [0] * TOTAL_BITS)

    def offset(self, anillo: str) -> int:
        offset = 0
        for current in ORDER:
            if current == anillo:
                return offset
            offset += RINGS[current]["total_bits"]
        raise ValueError(f"Anillo desconocido: {anillo}")

    def indice(self, anillo: str, sector: int = 1, porcion: int = 1, bit: int = 1) -> int:
        if anillo == "c":
            return 0
        if sector not in (1, 2, 3, 4):
            raise ValueError("Sector debe ser 1-4")
        if porcion not in (1, 2):
            raise ValueError("Porción debe ser 1-2")
        bits = RINGS[anillo]["bits_por_porcion"]
        if bit < 1 or bit > bits:
            raise ValueError(f"Bit debe ser 1-{bits}")
        porcion_global = (sector - 1) * 2 + (porcion - 1)
        return self.offset(anillo) + porcion_global * bits + (bit - 1)

    def escribir(self, anillo: str, sector: int, porcion: int, bit: int, valor: int) -> None:
        self.estado[self.indice(anillo, sector, porcion, bit)] = 1 if valor else 0


SPRITES: dict[str, MFNSprite] = {}
WS_CLIENTS: set[Any] = set()


def normalize_state(value: Any) -> list[int]:
    state = [0] * TOTAL_BITS
    if isinstance(value, list):
        for index, bit in enumerate(value[:TOTAL_BITS]):
            state[index] = 1 if bit else 0
    return state


def parse_coordinate(sprite: MFNSprite, coord: str, value: int) -> None:
    parts = coord.split(":")
    if len(parts) == 4 and parts[1].startswith("S"):
        sprite.escribir(parts[0], int(parts[1][1:]), int(parts[2][1:]), int(parts[3][1:]), value)
        return
    if len(parts) == 4:
        sprite.escribir(parts[0], int(parts[1]), int(parts[2]), int(parts[3]), value)
        return
    raise ValueError(f"Coordenada inválida: {coord}")


def detect_patterns(state: list[int], block_size: int = 3) -> list[dict[str, Any]]:
    rows = [state[row * MATRIX_SIZE : row * MATRIX_SIZE + MATRIX_SIZE] for row in range(MATRIX_SIZE)]
    table: dict[str, dict[str, Any]] = {}
    for row in range(MATRIX_SIZE - block_size + 1):
        for col in range(MATRIX_SIZE - block_size + 1):
            key = "".join(str(rows[row + y][col + x]) for y in range(block_size) for x in range(block_size))
            table.setdefault(key, {"key": key, "size": block_size, "coordinates": []})["coordinates"].append([row + 1, col + 1])
    patterns = []
    for index, pattern in enumerate(table.values()):
        patterns.append({
            "id": f"P{index:02d}",
            "key": pattern["key"],
            "size": pattern["size"],
            "count": len(pattern["coordinates"]),
            "coordinates": pattern["coordinates"],
        })
    return sorted(patterns, key=lambda item: item["count"], reverse=True)


def state_svg_base64(state: list[int]) -> str:
    cell = 18
    size = cell * MATRIX_SIZE
    rects = []
    for row in range(MATRIX_SIZE):
        for col in range(MATRIX_SIZE):
            on = state[row * MATRIX_SIZE + col] == 1
            rects.append(
                f'<rect x="{col * cell}" y="{row * cell}" width="16" height="16" rx="3" '
                f'fill="{"#ff3048" if on else "#162426"}" stroke="#5cff72" stroke-opacity="0.55" />'
            )
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}"><rect width="100%" height="100%" fill="#071011" />{"".join(rects)}</svg>'
    return base64.b64encode(svg.encode("utf-8")).decode("ascii")


@app.post("/api/sprite/create")
def create_sprite():
    payload = request.get_json(force=True)
    sprite = MFNSprite()
    incoming = payload.get("estado", [])
    if isinstance(incoming, dict):
        for coord, value in incoming.items():
            parse_coordinate(sprite, coord, int(value))
    else:
        sprite.estado = normalize_state(incoming)
    sprite_id = str(uuid.uuid4())
    SPRITES[sprite_id] = sprite
    return jsonify({"sprite_id": sprite_id, "estado": sprite.estado})


@app.post("/api/sprite/render")
def render_sprite():
    payload = request.get_json(force=True)
    sprite = SPRITES[payload["sprite_id"]]
    return jsonify({"imagen_svg_base64": state_svg_base64(sprite.estado), "dimensiones": "13x13"})


@app.post("/api/sprite/compress")
def compress_sprite():
    payload = request.get_json(force=True)
    sprite = SPRITES[payload["sprite_id"]]
    patterns = detect_patterns(sprite.estado, int(payload.get("block_size", 3)))
    repeated = [pattern for pattern in patterns if pattern["count"] > 1]
    return jsonify({
        "comprimido": {
            "header": "MFN_COMPRESSED_V1",
            "estado_base": sprite.estado,
            "patrones": repeated[:16],
            "patrones_count": len(repeated),
        }
    })


@app.post("/api/sprite/reconstruct")
def reconstruct_sprite():
    payload = request.get_json(force=True)["comprimido"]
    return jsonify({"estado": normalize_state(payload.get("estado_base", []))})


@app.post("/api/sprite/transmission")
def transmission_packet():
    payload = request.get_json(force=True)
    state = normalize_state(payload.get("estado", []))
    packet = {"header": "MFN_SPRITE_V1", "total_bits": TOTAL_BITS, "baud": 300, "datos": state}
    encoded = json.dumps(packet, separators=(",", ":")).encode("utf-8")
    return jsonify({"paquete": packet, "bytes": len(encoded), "segundos_300_baud": len(encoded) * 10 / 300})


@sock.route("/ws/sprite/logs")
def sprite_logs(ws):
    WS_CLIENTS.add(ws)
    try:
        while True:
            message = ws.receive()
            if message is None:
                break
            for client in list(WS_CLIENTS):
                try:
                    client.send(message)
                except Exception:
                    WS_CLIENTS.discard(client)
    finally:
        WS_CLIENTS.discard(ws)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

