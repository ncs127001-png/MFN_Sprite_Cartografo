# 🧭 MFN_Sprite_Cartógrafo - Guía Técnica para Desarrolladores

## 📋 Resumen Ejecutivo

El **MFN_Sprite_Cartógrafo** es una interfaz gráfica interactiva que permite visualizar y manipular patrones binarios organizados en una matriz radial de 13x13 celdas (169 bits totales). Cada celda representa un bit que puede activarse/desactivarse mediante click, formando "sprites" o símbolos comprimidos.

### Propósito Principal
- **Visualización**: Renderizar patrones binarios en formato radial
- **Interacción**: Permitir edición manual de bits mediante clicks
- **Codificación**: Convertir patrones visuales en secuencias binarias comprimidas
- **Comunicación**: Enviar/recibir patrones vía API REST y WebSocket

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Bun + Vite)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   game.js   │──│ mfn-core.js  │──│ mfn-renderer.js   │  │
│  │ (Lógica UI) │  │(Constantes)  │  │  (Canvas Draw)    │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│         │                │                      │            │
│         └────────────────┼──────────────────────┘            │
│                          │                                   │
│                  ┌───────────────┐                           │
│                  │ mfn-library.js│                           │
│                  │ (Símbolos A-Z)│                           │
│                  └───────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Flask + Python)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   app.py    │──│   routes/    │──│   services/       │  │
│  │ (API Entry) │  │ (Endpoints)  │  │ (Business Logic)  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔢 Sistema de Coordenadas Radiales

### Estructura de la Matriz

La interfaz usa un sistema de coordenadas **polar discretizado** en lugar de cartesiano:

```
                    Sector 0
                       ↑
          11 ← 10 ← 9 ← 8 → 1 → 2 → 3
                       │
              Ring 0   │   Ring 1   Ring 2 ... Ring 6
                       │
          (Centro)     ●     ○        ○         ○
```

### Componentes del Sistema de Coordenadas

#### 1. **Anillos (Rings)** - 7 niveles radiales
| Anillo | Símbolo | Color | Bits | Rango Índices |
|--------|---------|-------|------|---------------|
| 0 | `c` | Cian | 1 | 0 |
| 1 | `am` | Amarillo | 6 | 1-6 |
| 2 | `na` | Naranja | 12 | 7-18 |
| 3 | `vi` | Verde | 18 | 19-36 |
| 4 | `añ` | Añil | 24 | 37-60 |
| 5 | `az` | Azul | 30 | 61-90 |
| 6 | `m` | Magenta | 36 | 91-126 |
| **Total** | | | **127 bits** | (+ 42 bits extra = 169 total) |

> **Nota**: Los 169 bits totales incluyen bits de control/extensión más allá de los 127 bits base.

#### 2. **Sectores** - 12 divisiones angulares
- La circunferencia se divide en **12 sectores** (como un reloj)
- Cada sector abarca **30 grados** (360° / 12)
- Numeración: 0-11 en sentido horario, comenzando desde arriba (12 en punto)

#### 3. **Porciones (Portions)** - Subdivisiones por anillo
Cada anillo tiene un número específico de porciones:
- **Ring 0**: 1 porción (centro)
- **Ring 1**: 6 porciones (2 por sector)
- **Ring 2**: 12 porciones (1 por sector)
- **Ring 3**: 18 porciones (1.5 por sector)
- **Ring 4**: 24 porciones (2 por sector)
- **Ring 5**: 30 porciones (2.5 por sector)
- **Ring 6**: 36 porciones (3 por sector)

#### 4. **Bits por Porción**
- Cada porción contiene **1 bit** (una celda activable)
- Total: **169 bits** = 13×13 matriz aplanada en estructura radial

---

## 🎯 Lógica de Punteros y Navegación

### Objeto Pointer

El puntero actual se representa como:

```javascript
{
  ring: 0-6,        // Anillo radial actual
  sector: 0-11,     // Sector angular (0 = arriba, horario)
  portion: 0-35,    // Porción específica dentro del anillo
  bit: 0-168,       // Índice absoluto en el array de 169 bits
  active: boolean   // Estado del bit (0/1)
}
```

### Conversión de Coordenadas

#### De Cartesianas a Polares (Click → Pointer)

```javascript
// Cuando el usuario hace click en (x, y):
function cartesianToPolar(x, y, centerX, centerY) {
  const dx = x - centerX;
  const dy = y - centerY;
  
  // Distancia desde el centro → determina el anillo
  const distance = Math.sqrt(dx*dx + dy*dy);
  const ring = Math.floor(distance / CELL_SIZE);
  
  // Ángulo → determina el sector
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  angle = (angle + 90) % 360;  // Rotar para que 0° esté arriba
  const sector = Math.floor(angle / 30);  // 360° / 12 sectores
  
  return { ring, sector };
}
```

#### De Polares a Índice de Bit

```javascript
// Calcular índice absoluto del bit desde (ring, sector)
function polarToBitIndex(ring, sector) {
  const offsets = [0, 1, 7, 19, 37, 61, 91];  // Acumulados por anillo
  const portionsPerRing = [1, 6, 12, 18, 24, 30, 36];
  
  if (ring === 0) return 0;
  
  // Porciones en este anillo hasta el sector actual
  const portionInRing = Math.floor(
    (sector * portionsPerRing[ring]) / 12
  );
  
  return offsets[ring] + portionInRing;
}
```

---

## 🎮 Modos de Operación

### 1. **Modo Edición** (Default)
- Click en celda → Toggle bit (0 ↔ 1)
- Arrastrar → Pintar múltiples celdas
- Visualización: Celdas activas = color del anillo, inactivas = gris

### 2. **Modo Lectura**
- Solo visualización
- No interactivo
- Usado para mostrar patrones recibidos del backend

### 3. **Modo Comparación**
- Muestra dos patrones superpuestos
- Highlight de diferencias
- Útil para debugging de compresión

### 4. **Modo Animación**
- Rotación automática del canvas
- Demostración de simetría radial
- Control de velocidad de rotación

---

## 📦 Dependencias Clave

### Frontend (`package.json`)
```json
{
  "dependencies": {
    "vue": "^3.x",           // Framework reactivo (si usa Vue)
    // O alternativamente:
    // Vanilla JS con módulos ES6
  },
  "devDependencies": {
    "vite": "^5.x",          // Build tool y dev server
    "bun": "^1.x"            // Runtime y package manager
  }
}
```

### Backend (`requirements.txt`)
```txt
Flask==3.0.x                 # Framework web
Flask-SocketIO==5.3.x        # WebSocket support
Flask-CORS==4.0.x            # Cross-origin requests
numpy==1.26.x                # Manipulación de arrays (si aplica)
```

---

## 🔌 Endpoints de la API

### REST Endpoints

| Método | Endpoint | Descripción | Payload |
|--------|----------|-------------|---------|
| `GET` | `/api/sprite` | Obtener sprite actual | - |
| `POST` | `/api/sprite` | Guardar nuevo sprite | `{ bits: [0,1,1,...] }` |
| `PUT` | `/api/sprite/:id` | Actualizar sprite existente | `{ bits: [...] }` |
| `DELETE` | `/api/sprite/:id` | Eliminar sprite | - |
| `GET` | `/api/library` | Listar símbolos disponibles | - |
| `POST` | `/api/compress` | Comprimir patrón | `{ bits: [...] }` |
| `POST` | `/api/decompress` | Descomprimir código | `{ code: "A3F..." }` |

### WebSocket Events

```javascript
// Cliente → Servidor
socket.emit('update_sprite', { bits: [...] });
socket.emit('request_library', {});
socket.emit('subscribe_room', { room: 'room_id' });

// Servidor → Cliente
socket.on('sprite_updated', (data) => { /* bits actualizados */ });
socket.on('user_joined', (data) => { /* notificación */ });
socket.on('sync_state', (data) => { /* estado completo */ });
```

---

## 🧠 Funciones Principales por Módulo

### `mfn-core.js` - Constantes y Utilidades
```javascript
export const CONSTANTS = {
  GRID_SIZE: 13,
  TOTAL_BITS: 169,
  RINGS: 7,
  SECTORS: 12,
  COLORS: { c: '#00FFFF', am: '#FFFF00', na: '#FFA500', ... }
};

export function bitIndexToCoords(index) { /* ... */ }
export function coordsToBitIndex(ring, sector) { /* ... */ }
export function rotatePattern(bits, degrees) { /* ... */ }
```

### `game.js` - Lógica Principal
```javascript
class Game {
  constructor() {
    this.bits = Array(169).fill(0);
    this.pointer = null;
    this.mode = 'edit';
    this.isDragging = false;
  }
  
  handleCanvasClick(event) { /* ... */ }
  handleCanvasMove(event) { /* ... */ }
  toggleBit(index) { /* ... */ }
  sendToBackend() { /* ... */ }
  loadFromBackend(id) { /* ... */ }
}
```

### `mfn-renderer.js` - Renderizado en Canvas
```javascript
export function drawGrid(ctx, bits) { /* Dibuja las 169 celdas */ }
export function drawRadial(ctx, rings, sectors) { /* Líneas guía */ }
export function highlightCell(ctx, pointer) { /* Puntero activo */ }
export function animateRotation(ctx, speed) { /* Rotación */ }
```

### `mfn-library.js` - Símbolos Predefinidos
```javascript
export const SYMBOLS = {
  'A': { bits: [0,1,0,1,...], description: 'Letra A' },
  'B': { bits: [1,0,1,0,...], description: 'Letra B' },
  // ... A-Z, 0-9
};

export function loadSymbol(char) { /* Retorna bits del símbolo */ }
export function searchPattern(bits) { /* Busca match en library */ }
```

### `mfn-compression.js` - Algoritmo de Compresión
```javascript
export function compress(bits) { 
  // Convierte 169 bits → string corto (ej: "A3F7B2")
  // Usa patrones repetitivos y simetrías
}

export function decompress(code) { 
  // Convierte string → 169 bits
  // Expande código a patrón completo
}
```

---

## 🔄 Flujo de Datos Típico

### 1. Usuario hace click en celda
```
Click (x,y) 
  → cartesianToPolar() 
  → {ring, sector} 
  → polarToBitIndex() 
  → bitIndex 
  → toggleBit(bitIndex) 
  → bits[bitIndex] ^= 1 
  → render() 
  → emit('update_sprite', bits)
```

### 2. Recepción de sprite desde backend
```
WebSocket: 'sprite_updated' 
  → data.bits 
  → game.bits = data.bits 
  → render() 
  → updateUI()
```

### 3. Guardar sprite
```
Click "Guardar" 
  → POST /api/sprite { bits: game.bits } 
  → Backend guarda en DB 
  → Retorna { id, code } 
  → Mostrar confirmación
```

---

## 🛠️ Comandos de Desarrollo

```bash
# Instalar dependencias frontend
bun install

# Instalar dependencias backend
cd backend && pip3 install -r requirements.txt

# Iniciar backend (puerto 5000)
cd backend && python3 app.py

# Iniciar frontend dev server (puerto 5173)
bun run dev

# Build de producción
bun run build

# Ejecutar tests
bun run test
```

---

## 🐛 Debugging Tips

### Ver estado del puntero en consola
```javascript
// En game.js, agregar:
console.log('Pointer:', this.pointer);
console.log('Bit index:', this.pointer?.bit);
console.log('Current value:', this.bits[this.pointer?.bit]);
```

### Inspeccionar bits activos
```javascript
// Contar bits activos por anillo
function countBitsByRing(bits) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const offsets = [0, 1, 7, 19, 37, 61, 91];
  const sizes = [1, 6, 12, 18, 24, 30, 36];
  
  for (let ring = 0; ring < 7; ring++) {
    for (let i = 0; i < sizes[ring]; i++) {
      counts[ring] += bits[offsets[ring] + i];
    }
  }
  return counts;
}
```

### Verificar conectividad WebSocket
```javascript
socket.on('connect', () => console.log('✅ Connected'));
socket.on('disconnect', () => console.log('❌ Disconnected'));
socket.on('error', (err) => console.error('⚠️ Error:', err));
```

---

## 📚 Glosario de Términos

| Término | Definición |
|---------|------------|
| **Sprite** | Patrón binario de 169 bits que representa un símbolo |
| **Anillo/Ring** | Cada uno de los 7 círculos concéntricos de la matriz |
| **Sector** | Una de las 12 divisiones angulares (30° cada una) |
| **Porción** | Subdivisión de un anillo que contiene 1 bit |
| **Bit Index** | Posición absoluta (0-168) en el array plano de bits |
| **MFN** | [Significado del acrónimo según tu proyecto] |
| **Cartógrafo** | Metáfora de "mapear" patrones en espacio radial |

---

## 🚀 Próximos Pasos Sugeridos

1. **Validación de patrones**: Implementar checksum para detectar corrupción
2. **Historial deshacer/rehacer**: Stack de estados anteriores
3. **Exportar a imagen**: Descargar sprite como PNG/SVG
4. **Colaboración en tiempo real**: Múltiples usuarios editando mismo sprite
5. **Búsqueda por similitud**: Encontrar sprites parecidos en la biblioteca

---

## 📞 Contacto y Soporte

Para dudas sobre la implementación:
- Revisar comentarios inline en el código
- Checkear logs de consola del navegador
- Inspeccionar Network tab para llamadas API
- Usar `console.log()` estratéficos en `game.js`

---

*Documento generado para facilitar onboarding de nuevos desarrolladores al proyecto MFN_Sprite_Cartógrafo.*
