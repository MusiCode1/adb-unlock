/** Convert a drawn pattern (dot indices 0-8, row-major) to the digit sequence
 *  adb-unlock expects: keypad numbering 1-9, row-major (1 = top-left). index + 1. */
export function patternToDeviceDigits(indices: number[]): number[] {
	return indices.map((i) => i + 1);
}
export function formatPatternForDevice(indices: number[]): string {
	return patternToDeviceDigits(indices).join('');
}
export type SecretKind = 'pattern' | 'pin' | 'password';
export function adbUnlockCommand(kind: SecretKind, value: string, device = '<device>'): string {
	return `adb-unlock ${device} --${kind} '${value}'`;
}
