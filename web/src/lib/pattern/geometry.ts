import type { DotConfig, Point } from './types.js';

const GRID_SIZE = 3;
const PADDING = 20;
const CELL_SIZE = (100 - 2 * PADDING) / (GRID_SIZE - 1);

/** Hit radius in SVG coordinates (larger than visual for easier touch targeting) */
export const HIT_RADIUS = 14;

/** Visual dot radius */
export const DOT_RADIUS = 6;

/** Generate the 9 dots in a 3x3 grid, mapped to SVG coordinates 0-100 */
export const DOTS: DotConfig[] = Array.from({ length: 9 }, (_, i) => ({
	cx: PADDING + (i % GRID_SIZE) * CELL_SIZE,
	cy: PADDING + Math.floor(i / GRID_SIZE) * CELL_SIZE,
	index: i
}));

/** Find which dot (if any) is at the given SVG coordinate */
export function dotAt(point: Point): number | null {
	for (const dot of DOTS) {
		const dx = point.x - dot.cx;
		const dy = point.y - dot.cy;
		if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
			return dot.index;
		}
	}
	return null;
}

/**
 * Get dots that are crossed when drawing a line from `from` to `to`.
 * E.g., going from dot 0 to dot 2 crosses dot 1 (Android behavior).
 * Only returns dots that are between `from` and `to` in a straight line.
 */
export function lineCrossings(from: number, to: number): number[] {
	const fromDot = DOTS[from];
	const toDot = DOTS[to];

	const crossings: number[] = [];
	for (const dot of DOTS) {
		if (dot.index === from || dot.index === to) continue;

		// Check if dot is on the line between from and to
		const dxLine = toDot.cx - fromDot.cx;
		const dyLine = toDot.cy - fromDot.cy;
		const dxDot = dot.cx - fromDot.cx;
		const dyDot = dot.cy - fromDot.cy;

		// Cross product should be ~0 (collinear)
		const cross = dxLine * dyDot - dyLine * dxDot;
		if (Math.abs(cross) > 0.01) continue;

		// Dot product should be positive and less than line length squared (between endpoints)
		const dotProduct = dxLine * dxDot + dyLine * dyDot;
		const lineLenSq = dxLine * dxLine + dyLine * dyLine;
		if (dotProduct > 0 && dotProduct < lineLenSq) {
			crossings.push(dot.index);
		}
	}

	// Sort by distance from `from`
	crossings.sort((a, b) => {
		const da = (DOTS[a].cx - fromDot.cx) ** 2 + (DOTS[a].cy - fromDot.cy) ** 2;
		const db = (DOTS[b].cx - fromDot.cx) ** 2 + (DOTS[b].cy - fromDot.cy) ** 2;
		return da - db;
	});

	return crossings;
}

/**
 * Compute the SVG polygon points string for an arrowhead on a line.
 * @param x1, y1 - line start (SVG coords)
 * @param x2, y2 - line end (SVG coords)
 * @param position - where along the line (0=start, 1=end), e.g. 0.65
 * @param size - arrow size in SVG units
 * @returns polygon points string "x1,y1 x2,y2 x3,y3"
 */
export function arrowPoints(
	x1: number, y1: number,
	x2: number, y2: number,
	position: number,
	size: number
): string {
	// Point on the line at `position`
	const px = x1 + (x2 - x1) * position;
	const py = y1 + (y2 - y1) * position;

	// Direction vector (normalized)
	const dx = x2 - x1;
	const dy = y2 - y1;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len === 0) return `${px},${py} ${px},${py} ${px},${py}`;
	const nx = dx / len;
	const ny = dy / len;

	// Perpendicular vector
	const perpX = -ny;
	const perpY = nx;

	// Arrow tip (ahead of position)
	const tipX = px + nx * size * 0.6;
	const tipY = py + ny * size * 0.6;

	// Arrow base corners (behind position, spread perpendicular)
	const baseX = px - nx * size * 0.4;
	const baseY = py - ny * size * 0.4;
	const leftX = baseX + perpX * size * 0.4;
	const leftY = baseY + perpY * size * 0.4;
	const rightX = baseX - perpX * size * 0.4;
	const rightY = baseY - perpY * size * 0.4;

	return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
}

/** Convert SVG client coordinates to SVG viewBox coordinates */
export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point {
	const rect = svg.getBoundingClientRect();
	return {
		x: ((clientX - rect.left) / rect.width) * 100,
		y: ((clientY - rect.top) / rect.height) * 100
	};
}
