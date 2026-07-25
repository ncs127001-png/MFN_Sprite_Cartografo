import { LIBRARY_SYMBOLS, createDemoState, stateFromSymbol } from "./mfn-library.js";
import { compressState, packageForTransmission, patternsToCsv } from "./mfn-compression.js";
import {
	RINGS,
	TOTAL_BITS,
	activeCount,
	coordinateLabel,
	extractFragment,
	getRing,
	indexFromCell,
	indexFromRadial,
	normalizeState,
	rotateState,
	serializeState,
} from "./mfn-core.js";
import { drawGrid, drawRadial, frameMap, gridPointerFromEvent, radialPointerFromEvent } from "./mfn-renderer.js";

const DECAL_FRAMES_URL = "/generated-assets/mfn_ui_decals-transparent.frames.json";
const DEFAULT_POINTER = { ring: "m", sector: 1, portion: 1, bit: 1 };

function loadImage(url) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.decoding = "async";
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
		image.src = url;
	});
}

async function loadJson(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`No se pudo cargar JSON: ${url}`);
	return response.json();
}

function chunkBits(bits, size = 13) {
	const lines = [];
	for (let index = 0; index < bits.length; index += size) {
		lines.push(bits.slice(index, index + size).join(""));
	}
	return lines.join("\n");
}

function makeTimestamp() {
	return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fileName(stem, extension) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return `${stem}-${stamp}.${extension}`;
}

function svgDotMap(state) {
	const cell = 18;
	const margin = 4;
	const size = cell * 13 + margin * 2;
	let rects = "";
	for (let row = 0; row < 13; row += 1) {
		for (let col = 0; col < 13; col += 1) {
			const index = indexFromCell(row, col);
			const on = state[index] === 1;
			rects += `<rect x="${margin + col * cell}" y="${margin + row * cell}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${on ? "#ff3048" : "#172426"}" stroke="#5cff72" stroke-opacity="0.55"/>`;
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#071011"/>${rects}</svg>`;
}

export function createGame({ mount, sdk, ready, tweaks, assets }) {
	let cleanup = () => {};
	void ready;
	void tweaks;

	return {
		start() {
			let state = createDemoState();
			let pointer = { ...DEFAULT_POINTER };
			let decals = { image: null, frames: new Map() };
			let assetsReady = false;
			let started = false;
			let tickerOffset = 0;
			let lastCompression = compressState(state, 3);
			let lastPacket = packageForTransmission(state, lastCompression);
			const logs = [];
			const disposers = [];

			const shell = document.createElement("section");
			shell.className = "mfn-shell";
			shell.innerHTML = `
				<div class="mfn-workbench" hidden>
					<header class="mfn-hud" aria-label="Estado MFN">
						<div class="hud-chip primary"><span>ACTIVOS</span><strong data-active>0</strong></div>
						<div class="hud-chip"><span>COORD</span><strong data-coordinate>m:S1:P1:B1</strong></div>
						<div class="hud-chip"><span>COMPRESIÓN</span><strong data-ratio>1.00:1</strong></div>
					</header>

					<main class="mfn-main">
						<section class="panel canvas-panel grid-panel" aria-label="Editor de sprites 13 por 13">
							<div class="panel-title"><span>DOT MAP 13×13</span><b>G7 pivote</b></div>
							<canvas class="mfn-canvas" data-grid-canvas aria-label="Matriz cuadrada interactiva"></canvas>
						</section>
						<section class="panel canvas-panel radial-panel" aria-label="Vista radial MFN">
							<div class="panel-title"><span>ANILLOS RADIALES</span><b>4S × 2P</b></div>
							<canvas class="mfn-canvas" data-radial-canvas aria-label="Anillos concéntricos interactivos"></canvas>
						</section>

						<aside class="panel inspector-panel" aria-label="Panel de inspección">
							<div class="inspector-row"><span>Array lineal</span><b>${TOTAL_BITS} bits</b></div>
							<pre class="bitstream" data-bitstream></pre>
							<div class="inspector-row"><span>Fragmento</span><b data-fragment>RAW: 0000</b></div>
							<div class="mode-tabs" role="group" aria-label="Modo de lectura">
								<button type="button" class="is-active" data-mode="RAW">Visual</button>
								<button type="button" data-mode="AND">Semántico</button>
								<button type="button" data-mode="XOR">Etimológico</button>
							</div>
							<p class="mode-note" data-mode-note>RAW conserva la secuencia exacta desde el puntero.</p>
						</aside>
					</main>

					<section class="mfn-console">
						<div class="panel controls-panel">
							<label>Anillo <select data-ring-select></select></label>
							<label>Sector <select data-sector-select></select></label>
							<label>Porción <select data-portion-select></select></label>
							<label>Bit <select data-bit-select></select></label>
							<button type="button" data-write-one>Marcar 1</button>
							<button type="button" data-write-zero>Marcar 0</button>
						</div>

						<div class="panel controls-panel compact">
							<button type="button" data-rotate="1">Rotar 90°</button>
							<button type="button" data-rotate="2">180°</button>
							<button type="button" data-rotate="3">270°</button>
							<button type="button" data-clear>Limpiar</button>
							<button type="button" data-import>Importar JSON</button>
							<button type="button" data-export-json>JSON</button>
							<button type="button" data-export-png>PNG</button>
							<button type="button" data-export-svg>SVG</button>
							<button type="button" data-export-csv>CSV</button>
						</div>

						<div class="panel library-panel" aria-label="Biblioteca de sprites">
							<div class="panel-title"><span>Biblioteca</span><b>26 letras + 10 números</b></div>
							<div class="library-grid" data-library></div>
						</div>

						<div class="panel compression-panel">
							<div class="panel-title"><span>Patrones detectados</span><b data-pattern-count>0</b></div>
							<div class="pattern-list" data-pattern-list></div>
						</div>
					</section>

					<footer class="transmission-panel" aria-label="Simulador de transmisión">
						<span>TRANSMISIÓN 300 BAUD</span>
						<code data-transmission></code>
					</footer>
				</div>

				<div class="start-overlay" data-overlay>
					<div class="start-mark">MFN</div>
					<h1>MFN Sprite Cartógrafo</h1>
					<p data-start-status>Cargando matriz 13×13…</p>
					<button type="button" data-start-button disabled>Toca para activar</button>
				</div>
				<input type="file" accept="application/json,.json" data-file-input hidden>
			`;

			mount.replaceChildren(shell);

			const workbench = shell.querySelector(".mfn-workbench");
			const overlay = shell.querySelector("[data-overlay]");
			const startButton = shell.querySelector("[data-start-button]");
			const startStatus = shell.querySelector("[data-start-status]");
			const gridCanvas = shell.querySelector("[data-grid-canvas]");
			const radialCanvas = shell.querySelector("[data-radial-canvas]");
			const ringSelect = shell.querySelector("[data-ring-select]");
			const sectorSelect = shell.querySelector("[data-sector-select]");
			const portionSelect = shell.querySelector("[data-portion-select]");
			const bitSelect = shell.querySelector("[data-bit-select]");
			const fileInput = shell.querySelector("[data-file-input]");

			for (const ring of RINGS) {
				const option = document.createElement("option");
				option.value = ring.id;
				option.textContent = `${ring.id} · ${ring.label}`;
				ringSelect.append(option);
			}
			for (let value = 1; value <= 4; value += 1) {
				sectorSelect.append(new Option(String(value), String(value)));
			}
			for (let value = 1; value <= 2; value += 1) {
				portionSelect.append(new Option(String(value), String(value)));
			}

			const library = shell.querySelector("[data-library]");
			for (const symbol of LIBRARY_SYMBOLS) {
				const button = document.createElement("button");
				button.type = "button";
				button.textContent = symbol;
				button.dataset.symbol = symbol;
				library.append(button);
			}

			const addLog = (action) => {
				logs.unshift({ time: makeTimestamp(), action });
				logs.splice(7);
			};

			const haptic = () => {
				try {
					if (sdk?.device?.haptics?.isSupported()) void sdk.device.haptics.vibrate(18);
				} catch (error) {
					void error;
				}
			};

			const updateBitOptions = () => {
				const ring = getRing(pointer.ring);
				bitSelect.replaceChildren();
				const count = pointer.ring === "c" ? 1 : ring.bitsPerPortion;
				for (let value = 1; value <= count; value += 1) {
					bitSelect.append(new Option(String(value), String(value)));
				}
				pointer.bit = Math.min(pointer.bit, count);
				bitSelect.value = String(pointer.bit);
				sectorSelect.disabled = pointer.ring === "c";
				portionSelect.disabled = pointer.ring === "c";
				bitSelect.disabled = pointer.ring === "c";
			};

			const syncControls = () => {
				ringSelect.value = pointer.ring;
				sectorSelect.value = String(pointer.sector);
				portionSelect.value = String(pointer.portion);
				updateBitOptions();
			};

			const pointerFromControls = () => {
				pointer = {
					ring: ringSelect.value,
					sector: Number(sectorSelect.value),
					portion: Number(portionSelect.value),
					bit: Number(bitSelect.value),
				};
				if (pointer.ring === "c") pointer = { ring: "c", sector: 1, portion: 1, bit: 1 };
				syncControls();
				render();
			};

			const render = () => {
				lastCompression = compressState(state, 3);
				lastPacket = packageForTransmission(state, lastCompression);
				syncControls();
				drawGrid(gridCanvas, state, pointer, decals);
				drawRadial(radialCanvas, state, pointer, decals);

				const active = activeCount(state);
				shell.querySelector("[data-active]").textContent = `${active}/${TOTAL_BITS}`;
				shell.querySelector("[data-coordinate]").textContent = coordinateLabel(pointer);
				shell.querySelector("[data-ratio]").textContent = `${lastCompression.ratio.toFixed(2)}:1`;
				shell.querySelector("[data-bitstream]").textContent = chunkBits(state);

				const mode = shell.querySelector(".mode-tabs .is-active")?.dataset.mode || "RAW";
				const fragment = extractFragment(state, pointer, 6, mode);
				shell.querySelector("[data-fragment]").textContent = `${mode}: ${Array.isArray(fragment.bits) ? fragment.bits.join("") : fragment.value} → ${fragment.value}`;
				const modeNote = shell.querySelector("[data-mode-note]");
				modeNote.textContent = {
					RAW: "Visual conserva la secuencia exacta desde el puntero.",
					AND: "Semántico exige co-herencia total: todos los bits deben ser 1.",
					XOR: "Etimológico resalta diferencia: paridad de activaciones del fragmento.",
				}[mode] || "Lectura OR activa si cualquier bit del fragmento está encendido.";

				const repeated = lastCompression.repeatedPatterns;
				shell.querySelector("[data-pattern-count]").textContent = `${repeated.length} repetidos`;
				const patternList = shell.querySelector("[data-pattern-list]");
				patternList.replaceChildren(...repeated.slice(0, 5).map((pattern) => {
					const row = document.createElement("div");
					row.className = "pattern-row";
					row.innerHTML = `<b>${pattern.id}</b><span>${pattern.count}×</span><code>${pattern.key}</code>`;
					return row;
				}));
				if (repeated.length === 0) {
					const empty = document.createElement("div");
					empty.className = "empty-row";
					empty.textContent = "Sin repeticiones 3×3 útiles.";
					patternList.append(empty);
				}

				const transmission = shell.querySelector("[data-transmission]");
				const payload = `${lastPacket.payload} · ${lastPacket.bytes} B · ${lastPacket.secondsAt300Baud.toFixed(2)} s`;
				const padded = `${payload}   ${payload}`;
				transmission.textContent = padded.slice(tickerOffset, tickerOffset + 130);
			};

			const writePointer = (value) => {
				const index = pointer.ring === "c" ? 0 : indexFromRadial(pointer.ring, pointer.sector, pointer.portion, pointer.bit);
				state[index] = value;
				addLog(`${coordinateLabel(pointer)} = ${value}`);
				haptic();
				render();
			};

			const saveBlob = async (blob, name) => {
				try {
					if (sdk?.device?.fileSystem?.isSupported()) {
						await sdk.device.fileSystem.saveFile(blob, name);
						return;
					}
				} catch {
					addLog("Guardado SDK no disponible; usando descarga local");
				}
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = name;
				link.click();
				URL.revokeObjectURL(url);
			};

			const loadStateFromText = (text) => {
				const parsed = JSON.parse(text);
				state = normalizeState(Array.isArray(parsed) ? parsed : parsed.estado || parsed.state || parsed.datos);
				if (parsed.puntero) pointer = { ...DEFAULT_POINTER, ...parsed.puntero };
				addLog("Sprite importado desde JSON");
				render();
			};

			const on = (target, type, handler) => {
				target.addEventListener(type, handler);
				disposers.push(() => target.removeEventListener(type, handler));
			};

			on(startButton, "click", () => {
				if (!assetsReady || started) return;
				started = true;
				overlay.hidden = true;
				addLog("Editor activado");
				render();
			});

			on(gridCanvas, "pointerdown", (event) => {
				if (!started) return;
				const radial = gridPointerFromEvent(gridCanvas, event);
				if (!radial) return;
				pointer = { ring: radial.ring, sector: radial.sector, portion: radial.portion, bit: radial.bit };
				state[radial.index] = state[radial.index] ? 0 : 1;
				addLog(`${coordinateLabel(pointer)} alternado`);
				haptic();
				render();
			});

			on(radialCanvas, "pointerdown", (event) => {
				if (!started) return;
				const radial = radialPointerFromEvent(radialCanvas, event);
				if (!radial) return;
				pointer = { ring: radial.ring, sector: radial.sector, portion: radial.portion, bit: radial.bit };
				state[radial.index] = state[radial.index] ? 0 : 1;
				addLog(`${coordinateLabel(pointer)} desde vista radial`);
				haptic();
				render();
			});

			for (const select of [ringSelect, sectorSelect, portionSelect, bitSelect]) {
				on(select, "change", pointerFromControls);
			}

			on(shell.querySelector("[data-write-one]"), "click", () => writePointer(1));
			on(shell.querySelector("[data-write-zero]"), "click", () => writePointer(0));
			on(shell.querySelector("[data-clear]"), "click", () => {
				state = state.map(() => 0);
				addLog("Matriz limpiada");
				render();
			});

			for (const button of shell.querySelectorAll("[data-rotate]")) {
				on(button, "click", () => {
					const turns = Number(button.dataset.rotate);
					state = rotateState(state, turns);
					addLog(`Rotación ${turns * 90}°`);
					render();
				});
			}

			for (const button of shell.querySelectorAll("[data-mode]")) {
				on(button, "click", () => {
					for (const modeButton of shell.querySelectorAll("[data-mode]")) modeButton.classList.remove("is-active");
					button.classList.add("is-active");
					render();
				});
			}

			on(library, "click", (event) => {
				const button = event.target.closest("button[data-symbol]");
				if (!button) return;
				state = stateFromSymbol(button.dataset.symbol);
				addLog(`Sprite ${button.dataset.symbol} cargado`);
				render();
			});

			on(shell.querySelector("[data-export-json]"), "click", () => {
				const blob = new Blob([JSON.stringify(serializeState(state, pointer, logs), null, 2)], { type: "application/json" });
				void saveBlob(blob, fileName("mfn-sprite", "json"));
			});

			on(shell.querySelector("[data-export-csv]"), "click", () => {
				const blob = new Blob([patternsToCsv(lastCompression.patterns)], { type: "text/csv" });
				void saveBlob(blob, fileName("mfn-patrones", "csv"));
			});

			on(shell.querySelector("[data-export-svg]"), "click", () => {
				const blob = new Blob([svgDotMap(state)], { type: "image/svg+xml" });
				void saveBlob(blob, fileName("mfn-dot-map", "svg"));
			});

			on(shell.querySelector("[data-export-png]"), "click", () => {
				gridCanvas.toBlob((blob) => {
					if (blob) void saveBlob(blob, fileName("mfn-dot-map", "png"));
				}, "image/png");
			});

			on(shell.querySelector("[data-import]"), "click", async () => {
				try {
					if (sdk?.device?.fileSystem?.isSupported()) {
						const result = await sdk.device.fileSystem.openFile({ accept: [".json", "application/json"], multiple: false });
						if (result.files?.[0]) loadStateFromText(await sdk.device.fileSystem.readAsText(result.files[0]));
						return;
					}
				} catch {
					addLog("Importación SDK no disponible; usando selector local");
				}
				fileInput.click();
			});

			on(fileInput, "change", async () => {
				const file = fileInput.files?.[0];
				if (!file) return;
				loadStateFromText(await file.text());
				fileInput.value = "";
			});

			const resizeObserver = new ResizeObserver(() => {
				if (assetsReady) render();
			});
			resizeObserver.observe(shell);
			disposers.push(() => resizeObserver.disconnect());

			const interval = window.setInterval(() => {
				tickerOffset = (tickerOffset + 1) % Math.max(1, lastPacket.payload.length);
				if (assetsReady) render();
			}, 420);
			disposers.push(() => window.clearInterval(interval));

			const dashUrl = assets?.get("MFN_DASH_TEXTURE") || "/generated-assets/mfn_dash_texture.webp";
			shell.style.setProperty("--mfn-dash-texture", `url("${dashUrl}")`);
			const decalUrl = assets?.get("MFN_UI_DECALS") || "/generated-assets/mfn_ui_decals-transparent.webp";

			Promise.all([loadImage(decalUrl), loadJson(DECAL_FRAMES_URL)])
				.then(([image, frames]) => {
					decals = { image, frames: frameMap(frames) };
					assetsReady = true;
					workbench.hidden = false;
					startStatus.textContent = "Matriz lista: toca para editar";
					startButton.disabled = false;
					render();
				})
				.catch(() => {
					assetsReady = true;
					workbench.hidden = false;
					startStatus.textContent = "Recursos opcionales no cargaron; usando trazos técnicos";
					startButton.disabled = false;
					render();
				});

			cleanup = () => {
				for (const dispose of disposers.splice(0)) dispose();
				mount.replaceChildren();
			};
		},
		destroy() {
			cleanup();
			cleanup = () => {};
		},
		sdk,
		ready,
		tweaks,
		assets,
	};
}

