export const MATRIX_SIZE = 13;
export const CENTER = 6;

export const RINGS = [
	{ id: "c", label: "Centro", order: 0, bitsPerPortion: 1, totalBits: 1, color: "#d7ff3e" },
	{ id: "am", label: "Amarillo", order: 1, bitsPerPortion: 1, totalBits: 8, color: "#f9d84a" },
	{ id: "na", label: "Naranja", order: 2, bitsPerPortion: 2, totalBits: 16, color: "#ff7a1a" },
	{ id: "vi", label: "Violeta", order: 3, bitsPerPortion: 3, totalBits: 24, color: "#b13cff" },
	{ id: "añ", label: "Añil", order: 4, bitsPerPortion: 4, totalBits: 32, color: "#5b5ff0" },
	{ id: "az", label: "Azul", order: 5, bitsPerPortion: 5, totalBits: 40, color: "#168be8" },
	{ id: "m", label: "Marrón", order: 6, bitsPerPortion: 6, totalBits: 48, color: "#79503a" },
];

export const RING_IDS = RINGS.map((ring) => ring.id);
export const TOTAL_BITS = RINGS.reduce((total, ring) => total + ring.totalBits, 0);

export function createBlankState() {
	return Array.from({ length: TOTAL_BITS }, () => 0);
}

export function cloneState(state) {
	return normalizeState(state).slice();
}

export function normalizeState(state) {
	const next = createBlankState();
	if (!Array.isArray(state)) return next;
	for (let index = 0; index < Math.min(state.length, TOTAL_BITS); index += 1) {
		next[index] = state[index] ? 1 : 0;
	}
	return next;
}

export function getRing(id) {
	const ring = RINGS.find((entry) => entry.id === id);
	if (!ring) throw new Error(`Anillo desconocido: ${id}`);
	return ring;
}

export function offsetForRing(id) {
	let offset = 0;
	for (const ring of RINGS) {
		if (ring.id === id) return offset;
		offset += ring.totalBits;
	}
	throw new Error(`Anillo desconocido: ${id}`);
}

export function portionGlobal(sector, portion) {
	if (!Number.isInteger(sector) || sector < 1 || sector > 4) {
		throw new Error("Sector debe ser 1-4");
	}
	if (!Number.isInteger(portion) || portion < 1 || portion > 2) {
		throw new Error("Porción debe ser 1-2");
	}
	return (sector - 1) * 2 + (portion - 1);
}

export function indexFromRadial(ringId, sector = 1, portion = 1, bit = 1) {
	if (ringId === "c") return 0;
	const ring = getRing(ringId);
	const globalPortion = portionGlobal(sector, portion);
	if (!Number.isInteger(bit) || bit < 1 || bit > ring.bitsPerPortion) {
		throw new Error(`Bit debe ser 1-${ring.bitsPerPortion}`);
	}
	return offsetForRing(ringId) + globalPortion * ring.bitsPerPortion + (bit - 1);
}

export function radialFromIndex(index) {
	if (!Number.isInteger(index) || index < 0 || index >= TOTAL_BITS) {
		throw new Error(`Índice fuera de rango: ${index}`);
	}
	let offset = 0;
	for (const ring of RINGS) {
		if (index < offset + ring.totalBits) {
			if (ring.id === "c") {
				return { ring: "c", sector: 1, portion: 1, bit: 1, index };
			}
			const local = index - offset;
			const globalPortion = Math.floor(local / ring.bitsPerPortion);
			return {
				ring: ring.id,
				sector: Math.floor(globalPortion / 2) + 1,
				portion: (globalPortion % 2) + 1,
				bit: (local % ring.bitsPerPortion) + 1,
				index,
			};
		}
		offset += ring.totalBits;
	}
	throw new Error(`Índice fuera de rango: ${index}`);
}

export function cellForRadial(ringId, sector = 1, portion = 1, bit = 1) {
	if (ringId === "c") return { row: CENTER, col: CENTER };
	const ring = getRing(ringId);
	const radius = ring.order;
	const globalPortion = portionGlobal(sector, portion);
	const step = bit - 1;
	if (step < 0 || step >= radius) throw new Error(`Bit debe ser 1-${radius}`);

	switch (globalPortion) {
		case 0:
			return { row: CENTER - radius, col: CENTER + step };
		case 1:
			return { row: CENTER - radius + step, col: CENTER + radius };
		case 2:
			return { row: CENTER + step, col: CENTER + radius };
		case 3:
			return { row: CENTER + radius, col: CENTER + radius - step };
		case 4:
			return { row: CENTER + radius, col: CENTER - step };
		case 5:
			return { row: CENTER + radius - step, col: CENTER - radius };
		case 6:
			return { row: CENTER - step, col: CENTER - radius };
		case 7:
			return { row: CENTER - radius, col: CENTER - radius + step };
		default:
			throw new Error(`Porción global inválida: ${globalPortion}`);
	}
}

export function cellForIndex(index) {
	const radial = radialFromIndex(index);
	return cellForRadial(radial.ring, radial.sector, radial.portion, radial.bit);
}

export function radialFromCell(row, col) {
	if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
	if (row < 0 || row >= MATRIX_SIZE || col < 0 || col >= MATRIX_SIZE) return null;
	const radius = Math.max(Math.abs(row - CENTER), Math.abs(col - CENTER));
	if (radius === 0) return { ring: "c", sector: 1, portion: 1, bit: 1, index: 0 };
	const ring = RINGS.find((entry) => entry.order === radius);
	if (!ring) return null;

	for (let globalPortion = 0; globalPortion < 8; globalPortion += 1) {
		for (let bit = 1; bit <= radius; bit += 1) {
			const sector = Math.floor(globalPortion / 2) + 1;
			const portion = (globalPortion % 2) + 1;
			const cell = cellForRadial(ring.id, sector, portion, bit);
			if (cell.row === row && cell.col === col) {
				return {
					ring: ring.id,
					sector,
					portion,
					bit,
					index: indexFromRadial(ring.id, sector, portion, bit),
				};
			}
		}
	}
	return null;
}

export function indexFromCell(row, col) {
	const radial = radialFromCell(row, col);
	return radial ? radial.index : -1;
}

export function rotateState(state, quarterTurns = 1) {
	const turns = ((quarterTurns % 4) + 4) % 4;
	let next = normalizeState(state);
	for (let turn = 0; turn < turns; turn += 1) {
		const rotated = createBlankState();
		for (let index = 0; index < TOTAL_BITS; index += 1) {
			const { row, col } = cellForIndex(index);
			const targetRow = col;
			const targetCol = MATRIX_SIZE - 1 - row;
			rotated[indexFromCell(targetRow, targetCol)] = next[index];
		}
		next = rotated;
	}
	return next;
}

export function activeCount(state) {
	return normalizeState(state).reduce((total, bit) => total + bit, 0);
}

export function matrixFromState(state) {
	const matrix = Array.from({ length: MATRIX_SIZE }, () => Array.from({ length: MATRIX_SIZE }, () => 0));
	const clean = normalizeState(state);
	for (let index = 0; index < TOTAL_BITS; index += 1) {
		const { row, col } = cellForIndex(index);
		matrix[row][col] = clean[index];
	}
	return matrix;
}

export function stateFromMatrix(matrix) {
	const state = createBlankState();
	for (let row = 0; row < MATRIX_SIZE; row += 1) {
		for (let col = 0; col < MATRIX_SIZE; col += 1) {
			const index = indexFromCell(row, col);
			if (index >= 0) state[index] = matrix?.[row]?.[col] ? 1 : 0;
		}
	}
	return state;
}

export function coordinateLabel(radial) {
	if (!radial || radial.ring === "c") return "c:G7";
	return `${radial.ring}:S${radial.sector}:P${radial.portion}:B${radial.bit}`;
}

export function extractFragment(state, pointer, amount = 4, mode = "RAW") {
	const clean = normalizeState(state);
	const start = pointer?.ring === "c"
		? 0
		: indexFromRadial(pointer.ring, pointer.sector, pointer.portion, pointer.bit);
	const bits = [];
	for (let offset = 0; offset < amount; offset += 1) {
		bits.push(clean[(start + offset) % TOTAL_BITS]);
	}
	if (mode === "AND") return { bits, value: bits.every(Boolean) ? 1 : 0 };
	if (mode === "OR") return { bits, value: bits.some(Boolean) ? 1 : 0 };
	if (mode === "XOR") return { bits, value: bits.reduce((value, bit) => value ^ bit, 0) };
	return { bits, value: bits.join("") };
}

export function serializeState(state, pointer, logs = []) {
	return {
		header: "MFN_SPRITE_V1",
		total_bits: TOTAL_BITS,
		anillos: Object.fromEntries(RINGS.map((ring) => [
			ring.id,
			{ bits_por_porcion: ring.bitsPerPortion, total_bits: ring.totalBits },
		])),
		estado: normalizeState(state),
		puntero: pointer,
		logs,
	};
}

