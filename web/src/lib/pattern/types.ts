export interface Point {
	x: number;
	y: number;
}

export interface DotConfig {
	cx: number;
	cy: number;
	index: number;
}

export type PatternMode = 'input' | 'preview' | 'success' | 'error';
