import {
	MATRIX_SIZE,
	RINGS,
	cellForIndex,
	coordinateLabel,
	getRing,
	indexFromRadial,
	portionGlobal,
	radialFromCell,
	radialFromIndex,
} from "./mfn-core.js";

const TWO_PI = Math.PI * 2;

export function frameMap(framesData) {
	return new Map((framesData?.frames || []).map((frame) => [frame.name, frame]));
}

function drawFrameInBox(ctx, image, frame, x, y, width, height) {
	if (!image || !frame) return false;
	const source = frame.source;
	const crop = frame.content || source;
	const scaleX = width / source.w;
	const scaleY = height / source.h;
	ctx.drawImage(
		image,
		crop.x,
		crop.y,
		crop.w,
		crop.h,
		x + (crop.x - source.x) * scaleX,
		y + (crop.y - source.y) * scaleY,
		crop.w * scaleX,
		crop.h * scaleY,
	);
	return true;
}

function setCanvasSize(canvas) {
	const rect = canvas.getBoundingClientRect();
	const ratio = Math.min(window.devicePixelRatio || 1, 2);
	const width = Math.max(1, Math.floor(rect.width * ratio));
	const height = Math.max(1, Math.floor(rect.height * ratio));
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	const ctx = canvas.getContext("2d");
	ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
	return { ctx, width: rect.width, height: rect.height };
}

function roundedRect(ctx, x, y, width, height, radius) {
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, radius);
}

export function drawGrid(canvas, state, pointer, decals) {
	const { ctx, width, height } = setCanvasSize(canvas);
	ctx.clearRect(0, 0, width, height);
	const size = Math.min(width, height) - 10;
	const cell = size / MATRIX_SIZE;
	const left = (width - size) / 2;
	const top = (height - size) / 2;

	ctx.save();
	ctx.shadowColor = "rgba(42, 255, 99, 0.45)";
	ctx.shadowBlur = 14;
	ctx.strokeStyle = "#5cff72";
	ctx.lineWidth = 1.5;
	roundedRect(ctx, left - 2, top - 2, size + 4, size + 4, 8);
	ctx.stroke();
	ctx.restore();

	for (let row = 0; row < MATRIX_SIZE; row += 1) {
		for (let col = 0; col < MATRIX_SIZE; col += 1) {
			const radial = radialFromCell(row, col);
			const x = left + col * cell;
			const y = top + row * cell;
			const ring = radial ? getRing(radial.ring) : RINGS[0];
			const active = radial ? state[radial.index] === 1 : false;

			ctx.fillStyle = active ? "rgba(41, 255, 201, 0.14)" : "rgba(25, 35, 36, 0.88)";
			ctx.strokeStyle = active ? "rgba(67, 255, 210, 0.8)" : `${ring.color}99`;
			ctx.lineWidth = active ? 1.4 : 0.9;
			roundedRect(ctx, x + 2, y + 2, cell - 4, cell - 4, Math.max(3, cell * 0.12));
			ctx.fill();
			ctx.stroke();

			if (active) {
				const frameName = radial.index % 3 === 0 ? "red_bit" : "cyan_bit";
				const drawn = drawFrameInBox(
					ctx,
					decals?.image,
					decals?.frames.get(frameName),
					x + cell * 0.18,
					y + cell * 0.12,
					cell * 0.64,
					cell * 0.72,
				);
				if (!drawn) {
					ctx.fillStyle = frameName === "red_bit" ? "#ff3048" : "#20eaff";
					ctx.beginPath();
					ctx.arc(x + cell / 2, y + cell / 2, cell * 0.18, 0, TWO_PI);
					ctx.fill();
				}
			}
		}
	}

	const selectedIndex = pointer.ring === "c"
		? 0
		: indexFromRadial(pointer.ring, pointer.sector, pointer.portion, pointer.bit);
	const selectedCell = cellForIndex(selectedIndex);
	ctx.strokeStyle = "#f7ff4a";
	ctx.lineWidth = 2.5;
	ctx.shadowColor = "rgba(247,255,74,0.75)";
	ctx.shadowBlur = 10;
	roundedRect(
		ctx,
		left + selectedCell.col * cell + 2,
		top + selectedCell.row * cell + 2,
		cell - 4,
		cell - 4,
		Math.max(3, cell * 0.12),
	);
	ctx.stroke();
	ctx.shadowBlur = 0;

	return { left, top, size, cell };
}

export function gridPointerFromEvent(canvas, event) {
	const rect = canvas.getBoundingClientRect();
	const size = Math.min(rect.width, rect.height) - 10;
	const cell = size / MATRIX_SIZE;
	const left = (rect.width - size) / 2;
	const top = (rect.height - size) / 2;
	const x = event.clientX - rect.left - left;
	const y = event.clientY - rect.top - top;
	const col = Math.floor(x / cell);
	const row = Math.floor(y / cell);
	return radialFromCell(row, col);
}

function wedge(ctx, centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
	ctx.beginPath();
	ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
	ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
	ctx.closePath();
}

function polar(centerX, centerY, radius, angle) {
	return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

export function drawRadial(canvas, state, pointer, decals) {
	const { ctx, width, height } = setCanvasSize(canvas);
	ctx.clearRect(0, 0, width, height);
	const centerX = width / 2;
	const centerY = height / 2;
	const outer = Math.min(width, height) * 0.42;
	const ringWidth = outer / 7.3;
	const baseRadius = ringWidth * 0.85;

	ctx.save();
	ctx.strokeStyle = "rgba(94,255,122,0.62)";
	ctx.lineWidth = 1.4;
	for (let portion = 0; portion < 8; portion += 1) {
		const angle = -Math.PI / 2 + portion * Math.PI / 4;
		const from = polar(centerX, centerY, baseRadius * 0.3, angle);
		const to = polar(centerX, centerY, outer + ringWidth * 0.88, angle);
		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(to.x, to.y);
		ctx.stroke();
	}
	ctx.restore();

	for (const ring of RINGS.slice(1)) {
		const inner = baseRadius + (ring.order - 1) * ringWidth;
		const outerRadius = inner + ringWidth * 0.88;
		for (let sector = 1; sector <= 4; sector += 1) {
			for (let portion = 1; portion <= 2; portion += 1) {
				const globalPortion = portionGlobal(sector, portion);
				for (let bit = 1; bit <= ring.bitsPerPortion; bit += 1) {
					const slice = Math.PI / 4 / ring.bitsPerPortion;
					const start = -Math.PI / 2 + globalPortion * Math.PI / 4 + (bit - 1) * slice;
					const end = start + slice;
					const index = indexFromRadial(ring.id, sector, portion, bit);
					const active = state[index] === 1;
					wedge(ctx, centerX, centerY, inner, outerRadius, start + 0.006, end - 0.006);
					ctx.fillStyle = active ? `${ring.color}cc` : `${ring.color}38`;
					ctx.strokeStyle = active ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.22)";
					ctx.lineWidth = active ? 1.2 : 0.8;
					ctx.fill();
					ctx.stroke();

					if (active) {
						const mid = (start + end) / 2;
						const dot = polar(centerX, centerY, (inner + outerRadius) / 2, mid);
						drawFrameInBox(
							ctx,
							decals?.image,
							decals?.frames.get(index % 2 === 0 ? "magenta_bit" : "cyan_bit"),
							dot.x - ringWidth * 0.23,
							dot.y - ringWidth * 0.23,
							ringWidth * 0.46,
							ringWidth * 0.46,
						);
					}
				}
			}
		}
	}

	ctx.fillStyle = "rgba(215,255,62,0.85)";
	ctx.strokeStyle = "#5cff72";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(centerX, centerY, baseRadius * 0.45, 0, TWO_PI);
	ctx.fill();
	ctx.stroke();

	ctx.save();
	ctx.strokeStyle = "rgba(76, 145, 230, 0.95)";
	ctx.lineWidth = 2.2;
	ctx.beginPath();
	ctx.arc(centerX, centerY, outer + ringWidth * 0.7, 0, TWO_PI);
	ctx.stroke();
	ctx.restore();

	drawPointer(ctx, centerX, centerY, outer, ringWidth, pointer, decals);
	drawCompass(ctx, centerX, centerY, outer + ringWidth * 1.05);
}

function drawCompass(ctx, centerX, centerY, radius) {
	ctx.save();
	ctx.fillStyle = "rgba(136,255,153,0.94)";
	ctx.font = "600 14px 'Space Mono', monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	const labels = [
		["N", -Math.PI / 2],
		["E", 0],
		["S", Math.PI / 2],
		["W", Math.PI],
	];
	for (const [label, angle] of labels) {
		const point = polar(centerX, centerY, radius, angle);
		ctx.fillText(label, point.x, point.y);
	}
	ctx.restore();
}

function drawPointer(ctx, centerX, centerY, outer, ringWidth, pointer, decals) {
	let globalPortion = 0;
	let bitRatio = 0.5;
	if (pointer.ring !== "c") {
		const ring = getRing(pointer.ring);
		globalPortion = portionGlobal(pointer.sector, pointer.portion);
		bitRatio = (pointer.bit - 0.5) / ring.bitsPerPortion;
	}
	const angle = -Math.PI / 2 + globalPortion * Math.PI / 4 + bitRatio * Math.PI / 4;
	const tip = polar(centerX, centerY, outer + ringWidth * 1.05, angle);
	const boxSize = ringWidth * 1.1;
	const frameName = globalPortion === 6 ? "blue_pointer" : "red_pointer";
	ctx.save();
	ctx.translate(tip.x, tip.y);
	ctx.rotate(angle + Math.PI / 2);
	const drawn = drawFrameInBox(ctx, decals?.image, decals?.frames.get(frameName), -boxSize / 2, -boxSize / 2, boxSize, boxSize);
	if (!drawn) {
		ctx.fillStyle = frameName === "blue_pointer" ? "#1677ff" : "#ff244c";
		ctx.strokeStyle = "#72ff2d";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, -boxSize * 0.52);
		ctx.lineTo(boxSize * 0.42, boxSize * 0.34);
		ctx.lineTo(-boxSize * 0.42, boxSize * 0.34);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
	ctx.restore();

	ctx.save();
	ctx.fillStyle = "rgba(247,255,74,0.96)";
	ctx.font = "600 12px 'Space Mono', monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	const labelPoint = polar(centerX, centerY, outer + ringWidth * 1.45, angle);
	ctx.fillText(coordinateLabel(pointer), labelPoint.x, labelPoint.y);
	ctx.restore();
}

export function radialPointerFromEvent(canvas, event) {
	const rect = canvas.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;
	const centerX = rect.width / 2;
	const centerY = rect.height / 2;
	const dx = x - centerX;
	const dy = y - centerY;
	const distance = Math.hypot(dx, dy);
	const outer = Math.min(rect.width, rect.height) * 0.42;
	const ringWidth = outer / 7.3;
	const baseRadius = ringWidth * 0.85;
	const ringOrder = Math.floor((distance - baseRadius) / ringWidth) + 1;
	if (ringOrder < 1 || ringOrder > 6) return null;
	const ring = RINGS.find((entry) => entry.order === ringOrder);
	const normalizedAngle = (Math.atan2(dy, dx) + Math.PI / 2 + TWO_PI) % TWO_PI;
	const unit = normalizedAngle / (Math.PI / 4);
	const globalPortion = Math.min(7, Math.floor(unit));
	const local = unit - globalPortion;
	const bit = Math.min(ring.bitsPerPortion, Math.floor(local * ring.bitsPerPortion) + 1);
	const radial = radialFromIndex(indexFromRadial(
		ring.id,
		Math.floor(globalPortion / 2) + 1,
		(globalPortion % 2) + 1,
		bit,
	));
	return radial;
}

