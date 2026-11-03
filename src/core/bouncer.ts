// core/bouncer — מתמטיקת רשת-התבנית ובניית סקריפטי-הזרקה. טהור.
export type Bounds = [number, number, number, number];

const PATTERN_IDS = ["lockPatternView", "colorLockPatternView", "oplusos_kgd_security_pattern_view"];

/** bounds ריבועיים בקירוב — רשת 3x3 אמיתית היא ריבוע; מכל מסך-מלא אינו. */
function squarish(b: Bounds): boolean {
	const w = b[2] - b[0], h = b[3] - b[1];
	return w > 0 && h > 0 && Math.abs(w - h) <= 0.25 * Math.max(w, h);
}

/** מאתר את גבולות רשת-התבנית. מעדיף את ה-widget האמיתי (`lockPatternView` /
 *  `colorLockPatternView`) ודורש bounds ריבועיים — כך לא בוחרים node-מכל של
 *  מסך-מלא (OxygenOS `oplusos_kgd_security_pattern_view` = כל המסך), שהיה גורם
 *  הזרקה בקואורדינטות שגויות = ניסיון-תבנית שגוי. null אם אין רשת ריבועית. */
export function patternGridFromDump(xml: string): Bounds | null {
	const cands: { grid: boolean; b: Bounds }[] = [];
	for (const m of xml.matchAll(/<node\b[^>]*>/g)) {
		const s = m[0];
		const rid = (/resource-id="([^"]*)"/.exec(s)?.[1] ?? "").toLowerCase();
		const desc = /content-desc="([^"]*)"/.exec(s)?.[1] ?? "";
		const isGrid = rid.endsWith("lockpatternview"); // lockPatternView / colorLockPatternView
		const hit = isGrid || PATTERN_IDS.some((p) => rid.endsWith(p.toLowerCase()))
			|| desc.toLowerCase().includes("pattern") || desc.includes("תבנית");
		if (!hit) continue;
		const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(s);
		if (b) cands.push({ grid: isGrid, b: [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])] });
	}
	return cands.find((c) => c.grid && squarish(c.b))?.b
		?? cands.find((c) => squarish(c.b))?.b
		?? null;
}

export function patternPoints(b: Bounds): Record<number, [number, number]> {
	const [L, T, R, B] = b;
	const w = (R - L) / 3, h = (B - T) / 3;
	const pts: Record<number, [number, number]> = {};
	for (let d = 1; d <= 9; d++) {
		const i = d - 1, c = i % 3, r = Math.floor(i / 3);
		pts[d] = [Math.trunc(L + (c + 0.5) * w), Math.trunc(T + (r + 0.5) * h)];
	}
	return pts;
}

export function parsePatternDigits(cred: string): number[] {
	return [...cred].filter((c) => c >= "1" && c <= "9").map(Number);
}

export function buildPatternGesture(points: Record<number, [number, number]>, digits: number[]): string[] {
	const lines: string[] = [];
	digits.forEach((d, k) => {
		const [x, y] = points[d];
		lines.push(`input motionevent ${k === 0 ? "DOWN" : "MOVE"} ${x} ${y}`);
		lines.push("sleep 0.08");
	});
	const [lx, ly] = points[digits[digits.length - 1]];
	lines.push(`input motionevent UP ${lx} ${ly}`);
	return lines;
}

export function buildTextEntry(text: string): string[] {
	const esc = text.replace(/ /g, "%s");
	return [`input text '${esc}'`, "sleep 0.3", "input keyevent KEYCODE_ENTER"];
}

const PROBE: Record<"pattern" | "text", string> = {
	pattern: "lockpatternview",
	text: "passwordentry|pinentry|numpadkey|keyguard_pin|keyguard_password",
};

/** מעלה את ה-bouncer בלולאת-ניסיון בסשן אחד, עד שהוא מופיע (או N ניסיונות).
 *  שתי שיטות לפי הסדר, כי אף אחת אינה אוניברסלית (נצרב 2026-11-03):
 *    1. `wm dismiss-keyguard` — עובד ב-OxygenOS, לא ב-CUBOT.
 *    2. `input swipe` פרופורציונלי — עובד ב-CUBOT, פלייקי ב-OxygenOS.
 *  swipe רץ רק אם dismiss-keyguard לא העלה — כדי לא להחליק על bouncer מוצג
 *  (מה שעלול להיספר כניסיון-תבנית שגוי). משאיר dump ב-/sdcard/.au.xml ו-bouncer מוצג. */
export function raiseLoopScript(size?: { w: number; h: number }, kind: "pattern" | "text" = "pattern"): string {
	const x = size ? Math.round(size.w / 2) : 600;
	const y1 = size ? Math.round(size.h * 0.8) : 1600;
	const y2 = size ? Math.round(size.h * 0.2) : 400;
	const check = `uiautomator dump /sdcard/.au.xml >/dev/null 2>&1; grep -qiE '${PROBE[kind]}' /sdcard/.au.xml && break`;
	return [
		"for i in 1 2 3 4; do",
		"  input keyevent KEYCODE_WAKEUP; sleep 0.4",
		"  wm dismiss-keyguard; sleep 1.0",
		`  ${check}`,
		`  input swipe ${x} ${y1} ${x} ${y2} 150; sleep 0.8`,
		`  ${check}`,
		"  sleep 0.3",
		"done",
		"",
	].join("\n");
}
