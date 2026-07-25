import { TOTAL_BITS, activeCount, matrixFromState, normalizeState } from "./mfn-core.js";

function blockKey(matrix, row, col, size) {
	let key = "";
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			key += matrix[row + y][col + x];
		}
	}
	return key;
}

export function detectPatterns(state, size = 3) {
	const matrix = matrixFromState(state);
	const table = new Map();
	for (let row = 0; row <= 13 - size; row += 1) {
		for (let col = 0; col <= 13 - size; col += 1) {
			const key = blockKey(matrix, row, col, size);
			if (!table.has(key)) {
				table.set(key, { id: `P${table.size.toString().padStart(2, "0")}`, key, size, coordinates: [] });
			}
			table.get(key).coordinates.push({ row: row + 1, col: col + 1 });
		}
	}
	return Array.from(table.values())
		.map((pattern) => ({
			...pattern,
			count: pattern.coordinates.length,
			density: [...pattern.key].filter((bit) => bit === "1").length,
		}))
		.sort((a, b) => b.count - a.count || b.density - a.density);
}

export function compressState(state, blockSize = 3) {
	const clean = normalizeState(state);
	const patterns = detectPatterns(clean, blockSize);
	const repeated = patterns.filter((pattern) => pattern.count > 1);
	const savedBits = repeated.reduce((sum, pattern) => sum + (pattern.count - 1) * pattern.size * pattern.size, 0);
	const overheadBits = repeated.length * 8;
	const estimatedBits = Math.max(21, TOTAL_BITS - savedBits + overheadBits);
	return {
		header: "MFN_COMPRESSED_V1",
		blockSize,
		rawBits: TOTAL_BITS,
		estimatedBits,
		ratio: TOTAL_BITS / estimatedBits,
		activeBits: activeCount(clean),
		patterns,
		repeatedPatterns: repeated.slice(0, 16),
		stateBits: clean.join(""),
	};
}

export function packageForTransmission(state, compression) {
	const clean = normalizeState(state);
	const bitString = clean.join("");
	let hex = "";
	for (let index = 0; index < bitString.length; index += 8) {
		const byte = bitString.slice(index, index + 8).padEnd(8, "0");
		hex += Number.parseInt(byte, 2).toString(16).padStart(2, "0");
	}
	const packet = {
		header: "MFN_SPRITE_V1",
		total_bits: TOTAL_BITS,
		baud: 300,
		active_bits: activeCount(clean),
		patterns_count: compression.repeatedPatterns.length,
		estimated_bits: compression.estimatedBits,
		hex,
	};
	const payload = JSON.stringify(packet);
	return {
		packet,
		payload,
		bytes: new Blob([payload]).size,
		secondsAt300Baud: (payload.length * 10) / 300,
	};
}

export function patternsToCsv(patterns) {
	const rows = ["id,size,count,density,coordinates,key"];
	for (const pattern of patterns) {
		rows.push([
			pattern.id,
			pattern.size,
			pattern.count,
			pattern.density,
			`"${pattern.coordinates.map((coord) => `${coord.row}:${coord.col}`).join(" ")}"`,
			pattern.key,
		].join(","));
	}
	return rows.join("\n");
}

