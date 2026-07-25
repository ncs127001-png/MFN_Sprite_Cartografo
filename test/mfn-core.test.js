import assert from "node:assert/strict";
import test from "node:test";

import { LIBRARY_SYMBOLS, stateFromSymbol } from "../src/game/mfn-library.js";
import {
	RINGS,
	TOTAL_BITS,
	cellForIndex,
	indexFromCell,
	indexFromRadial,
	radialFromCell,
	radialFromIndex,
	rotateState,
} from "../src/game/mfn-core.js";
import { compressState, packageForTransmission } from "../src/game/mfn-compression.js";

test("MFN ring totals sum to 169 bits", () => {
	assert.equal(TOTAL_BITS, 169);
	assert.equal(RINGS.at(-1).totalBits, 48);
});

test("radial addresses round-trip through linear indices", () => {
	const index = indexFromRadial("añ", 2, 1, 3);
	assert.deepEqual(radialFromIndex(index), { ring: "añ", sector: 2, portion: 1, bit: 3, index });
});

test("square cells and radial coordinates are equivalent", () => {
	for (let index = 0; index < TOTAL_BITS; index += 1) {
		const cell = cellForIndex(index);
		assert.equal(indexFromCell(cell.row, cell.col), index);
		assert.equal(radialFromCell(cell.row, cell.col).index, index);
	}
});

test("four quarter rotations reconstruct the same state", () => {
	const state = stateFromSymbol("G");
	const rotated = rotateState(rotateState(rotateState(rotateState(state, 1), 1), 1), 1);
	assert.deepEqual(rotated, state);
});

test("library contains the requested Latin alphabet and digits", () => {
	assert.equal(LIBRARY_SYMBOLS.length, 36);
	assert.ok(LIBRARY_SYMBOLS.includes("A"));
	assert.ok(LIBRARY_SYMBOLS.includes("9"));
});

test("compression produces a transmissible MFN packet", () => {
	const state = stateFromSymbol("M");
	const compressed = compressState(state, 3);
	const packet = packageForTransmission(state, compressed);
	assert.equal(packet.packet.header, "MFN_SPRITE_V1");
	assert.equal(packet.packet.total_bits, 169);
	assert.ok(packet.bytes > 0);
});

