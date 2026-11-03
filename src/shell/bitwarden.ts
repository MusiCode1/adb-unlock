// shell/bitwarden — שליפת קרדנציאל דרך bw-mcp-cli (אופציונלי). IO.
import { spawnSync } from "node:child_process";

export function bwUnlocked(): boolean {
	try {
		const r = spawnSync("bw-mcp-cli", ["status"], { encoding: "utf8" });
		return JSON.parse(r.stdout ?? "{}").status === "unlocked";
	} catch { return false; }
}

export function bwItemFields(name: string): Record<string, string | undefined> {
	const r = spawnSync("bw-mcp-cli", ["get", "item", name], { encoding: "utf8" });
	if (r.status !== 0 || !r.stdout) throw new Error(`bitwarden item '${name}' not found`);
	const item = JSON.parse(r.stdout);
	const fields: Record<string, string | undefined> = {};
	for (const f of item.fields ?? []) fields[f.name] = f.value;
	return fields;
}
