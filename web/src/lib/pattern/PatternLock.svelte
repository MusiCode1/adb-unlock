<script lang="ts">
	import { DOTS, DOT_RADIUS, HIT_RADIUS, clientToSvg, dotAt, lineCrossings, arrowPoints } from '$lib/pattern/geometry.js';
	import type { PatternMode } from '$lib/pattern/types.js';

	interface Props {
		mode?: PatternMode;
		hint?: number[];
		disabled?: boolean;
		onPattern?: (indices: number[]) => void;
		size?: number;
		showNumbers?: boolean;
		showArrows?: boolean;
	}

	let {
		mode = 'input',
		hint = [],
		disabled = false,
		onPattern,
		size = 280,
		showNumbers = false,
		showArrows = false
	}: Props = $props();

	let svgEl: SVGSVGElement | undefined = $state();
	let activeIndices: number[] = $state([]);
	let currentPointer: { x: number; y: number } | null = $state(null);
	let isDrawing = $state(false);

	const selected = $derived(new Set(activeIndices));

	function addDot(index: number) {
		if (selected.has(index)) return;

		// Auto-add crossed dots (Android behavior)
		if (activeIndices.length > 0) {
			const lastIndex = activeIndices[activeIndices.length - 1];
			const crossings = lineCrossings(lastIndex, index);
			for (const crossed of crossings) {
				if (!selected.has(crossed)) {
					activeIndices.push(crossed);
				}
			}
		}

		activeIndices.push(index);

		// Haptic feedback
		if (navigator.vibrate) {
			navigator.vibrate(10);
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (disabled || mode !== 'input' || !svgEl) return;

		svgEl.setPointerCapture(e.pointerId);
		isDrawing = true;
		activeIndices = [];
		currentPointer = null;

		const point = clientToSvg(svgEl, e.clientX, e.clientY);
		const dot = dotAt(point);
		if (dot !== null) {
			addDot(dot);
		}
		currentPointer = point;
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDrawing || !svgEl) return;

		const point = clientToSvg(svgEl, e.clientX, e.clientY);
		currentPointer = point;

		const dot = dotAt(point);
		if (dot !== null) {
			addDot(dot);
		}
	}

	function handlePointerUp() {
		if (!isDrawing) return;
		isDrawing = false;
		currentPointer = null;

		if (activeIndices.length >= 2 && onPattern) {
			onPattern([...activeIndices]);
		}
		// Clear after a short delay for visual feedback
		if (mode === 'input') {
			setTimeout(() => {
				activeIndices = [];
			}, 200);
		}
	}

	function dotColor(index: number): string {
		if (mode === 'success') return 'var(--color-success)';
		if (mode === 'error') return 'var(--color-error)';
		if (selected.has(index)) return 'var(--color-primary)';
		return 'var(--color-text-muted)';
	}

	function lineColor(): string {
		if (mode === 'success') return 'var(--color-success)';
		if (mode === 'error') return 'var(--color-error)';
		return 'var(--color-primary)';
	}

	const isPreview = $derived(mode === 'preview' && hint.length > 0);
	const hasHint = $derived(hint.length > 0);
	const hintSet = $derived(new Set(hint));

	// Map from dot index to its order in the hint (1-based)
	const hintOrder = $derived.by(() => {
		const map = new Map<number, number>();
		for (let i = 0; i < hint.length; i++) {
			map.set(hint[i], i + 1);
		}
		return map;
	});

	const linePairs = $derived.by(() => {
		const displayIndices = mode === 'preview' ? hint : activeIndices;
		const pairs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
		for (let i = 1; i < displayIndices.length; i++) {
			const from = DOTS[displayIndices[i - 1]];
			const to = DOTS[displayIndices[i]];
			pairs.push({ x1: from.cx, y1: from.cy, x2: to.cx, y2: to.cy });
		}
		return pairs;
	});

	const trailingLine = $derived.by(() => {
		if (!isDrawing || !currentPointer || activeIndices.length === 0) return null;
		const last = DOTS[activeIndices[activeIndices.length - 1]];
		return { x1: last.cx, y1: last.cy, x2: currentPointer.x, y2: currentPointer.y };
	});
</script>

<svg
	bind:this={svgEl}
	viewBox="0 0 100 100"
	width={size}
	height={size}
	class="pattern-lock select-none"
	style="touch-action: none;"
	role="application"
	aria-label="Pattern lock grid"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
>
	<!-- Lines between selected dots -->
	{#each linePairs as line}
		<line
			x1={line.x1}
			y1={line.y1}
			x2={line.x2}
			y2={line.y2}
			stroke={lineColor()}
			stroke-width="2.5"
			stroke-linecap="round"
			opacity={isPreview ? 0.3 : 0.8}
		/>
	{/each}

	<!-- Arrows on preview lines -->
	{#if isPreview && showArrows}
		{#each linePairs as line}
			<polygon
				points={arrowPoints(line.x1, line.y1, line.x2, line.y2, 0.65, 6)}
				fill={lineColor()}
				opacity="0.4"
				class="hint-arrow"
			/>
		{/each}
	{/if}

	<!-- Trailing line to current pointer -->
	{#if trailingLine}
		<line
			x1={trailingLine.x1}
			y1={trailingLine.y1}
			x2={trailingLine.x2}
			y2={trailingLine.y2}
			stroke={lineColor()}
			stroke-width="1.5"
			stroke-linecap="round"
			opacity="0.4"
		/>
	{/if}

	<!-- Dots -->
	{#each DOTS as dot}
		<!-- Hit area (invisible, larger) -->
		<circle cx={dot.cx} cy={dot.cy} r={HIT_RADIUS} fill="transparent" />

		{@const isFirst = isPreview && hint.length > 0 && hint[0] === dot.index}
		{@const isInHint = hintSet.has(dot.index)}

		<!-- Visible dot -->
		<circle
			cx={dot.cx}
			cy={dot.cy}
			r={selected.has(dot.index)
				? DOT_RADIUS * 1.4
				: isFirst
					? DOT_RADIUS * 1.8
					: DOT_RADIUS}
			fill={isFirst ? 'var(--color-primary)' : dotColor(dot.index)}
			opacity={isPreview && isInHint && !isFirst ? 0.3 : 1}
			class="transition-[r] duration-100"
		/>

		<!-- Outer ring for selected dots or first hint dot -->
		{#if selected.has(dot.index) || isFirst}
			<circle
				cx={dot.cx}
				cy={dot.cy}
				r={isFirst ? DOT_RADIUS * 3 : DOT_RADIUS * 2.5}
				fill="none"
				stroke={isFirst ? 'var(--color-primary)' : dotColor(dot.index)}
				stroke-width={isFirst ? 1.5 : 1}
				opacity={isFirst ? 0.5 : 0.3}
			/>
		{/if}

		<!-- Numbers on hint dots (rendered in any mode when hint is available) -->
		{#if hasHint && showNumbers && hintOrder.has(dot.index)}
			<text
				x={dot.cx}
				y={dot.cy}
				text-anchor="middle"
				dominant-baseline="central"
				font-size="5.5"
				font-weight="bold"
				fill="var(--color-text)"
				opacity="0.5"
				class="hint-number pointer-events-none"
			>{hintOrder.get(dot.index)}</text>
		{/if}
	{/each}
</svg>
