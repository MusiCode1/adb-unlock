// shell/exec — התעבורה החיה (Node child_process). קורא ל-core לבניית ה-argv.
import { spawnSync } from "node:child_process";
import {
	buildAdbConnect, buildInvocation, chooseWrap,
	type DeviceProfile, type Transport, type Via,
} from "../core/transport.js";

export interface DeviceOpts { transport?: Transport; serial?: string; }

export class Device {
	wrap = "";
	private _root = false;
	constructor(public name: string, public profile: DeviceProfile, private opts: DeviceOpts = {}) {}
	get root(): boolean { return this._root; }

	private spawn(argv: string[], script?: string): string {
		const r = spawnSync(argv[0], argv.slice(1), {
			input: script, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
		});
		return (r.stdout ?? "") + (r.stderr ?? "");
	}

	runWith(wrap: string, script: string): string {
		return this.spawn(buildInvocation(this.name, this.profile, wrap, this.opts), script);
	}

	sh(script: string, o?: { asRoot?: boolean }): string {
		return this.runWith(o?.asRoot ? "su -c" : this.wrap, script);
	}

	detect(): void {
		const conn = buildAdbConnect(this.profile, this.opts);
		if (conn) this.spawn(conn);
		const out = this.runWith(
			"", "su -c id 2>/dev/null\ntest -x $HOME/rish && echo RISH=yes || echo RISH=no\n");
		this._root = /uid=0/.test(out);
		const rish = /RISH=yes/.test(out);
		const via = (this.profile.via ?? "auto") as Via;
		if (via === "root" && !this._root) throw new Error(`${this.name}: via=root but no root access`);
		this.wrap = chooseWrap({ root: this._root, rish }, via);
	}

	cleanLogcat(): void {
		try { this.sh("logcat -c\n", { asRoot: this.root }); } catch { /* best-effort */ }
	}
}

/** רשימת מכשירי ADB מחוברים (לבחירת מכשיר). */
export function adbDevices(): string {
	const r = spawnSync("adb", ["devices", "-l"], { encoding: "utf8" });
	return (r.stdout ?? "") + (r.stderr ?? "");
}

/** מזהי הסריאלים בלבד (device/unauthorized/offline). */
export function adbSerials(): { serial: string; state: string }[] {
	const out = adbDevices();
	const res: { serial: string; state: string }[] = [];
	for (const line of out.split("\n").slice(1)) {
		const m = /^(\S+)\s+(device|unauthorized|offline)\b/.exec(line.trim());
		if (m) res.push({ serial: m[1], state: m[2] });
	}
	return res;
}
