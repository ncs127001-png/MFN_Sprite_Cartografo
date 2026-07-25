# MFN_Sprite_Cartografo
Interfaz complementaria, visual y funcional para la gestion coherente de los 'estados de matriz' y herencias anidadas con endpoints dinamicos
# MFN Sprite Cartógrafo

Simulador visual para sprites MFN de 169 bits. La app permite editar la matriz 13×13, leer la representación radial por anillo/sector/porción/bit, mover el puntero inteligente, detectar patrones 3×3, rotar estados y exportar dot maps.

## Ejecutar la aplicación web

```bash
npm install
npm run dev
```

Abrir el preview local y tocar la pantalla inicial para activar el editor.

## Modelo MFN

La matriz se almacena como 169 bits en orden radial centro→afuera:

| Anillo | Bits por porción | Total |
| --- | ---: | ---: |
| c | 1 | 1 |
| am | 1 | 8 |
| na | 2 | 16 |
| vi | 3 | 24 |
| añ | 4 | 32 |
| az | 5 | 40 |
| m | 6 | 48 |

Dirección absoluta:

```text
anillo:Ssector:Pporcion:Bbit
añ:S2:P1:B3 = 1
```

Fórmula:

```text
porcion_global = (sector - 1) * 2 + (porcion - 1)
indice = offset_anillo + porcion_global * bits_por_porcion + (bit - 1)
```

## Funciones incluidas

- Editor táctil de matriz 13×13.
- Vista radial con seis anillos, ocho porciones y puntero triangular.
- Modos de lectura RAW, AND y XOR.
- Biblioteca de 26 letras latinas y 10 números.
- Rotación 90°, 180° y 270°.
- Exportación JSON, PNG, SVG y CSV de patrones.
- Simulación de paquete MFN a 300 baudios.
- Backend Flask opcional para integración ECN.

## Backend REST opcional

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Endpoints:

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/sprite/create` | Crea sprite desde `estado` como array o diccionario de coordenadas |
| POST | `/api/sprite/render` | Devuelve dot map SVG en base64 |
| POST | `/api/sprite/compress` | Detecta patrones y devuelve bloque comprimido |
| POST | `/api/sprite/reconstruct` | Reconstruye desde `estado_base` |
| POST | `/api/sprite/transmission` | Empaqueta para transmisión 300 baudios |
| WS | `/ws/sprite/logs` | Canal WebSocket para replicar logs de edición en tiempo real |

Ejemplo:

```bash
curl -X POST http://localhost:5000/api/sprite/create \
  -H 'Content-Type: application/json' \
  -d '{"estado":{"m:S1:P1:B1":1,"añ:S2:P1:B3":1}}'
```

## Tests

```bash
npm test
npm run build
```

## Docker

```bash
docker build -t mfn-sprite-cartografo .
docker run --rm -p 3000:3000 -p 5000:5000 mfn-sprite-cartografo
```

La web queda en `http://localhost:3000` y el backend en `http://localhost:5000`.
