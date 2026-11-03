// adb-unlock — inject a known pattern/PIN/password into a remote Android device.
// Functional core (core/) + imperative shell (shell/); this entry orchestrates.
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync, existsSync } from "node:fs";

import {
	buildPatternGesture, buildTextEntry, parsePatternDigits,
	patternGridFromDump, patternPoints, raiseBouncerScript,
} from "./core/bouncer.js";
import { parseRecon, reconScript } from "./core/recon.js";
import { resolveCredentialType, type CredType } from "./core/credential.js";
import { parseRegistry, type Registry } from "./core/schema.js";
import type { DeviceProfile, Transport, Via } from "./core/transport.js";
import { Device, adbDevices, adbSerials } from "./shell/exec.js";
import { bwItemFields, bwUnlocked } from "./shell/bitwarden.js";
import { promptHidden } from "./shell/prompt.js";

const ASK = "\0ASK";

function log(m: string) { process.stderr.write(m + "\n"); }
function die(m: string): never { log("✗ " + m); process.exit(1); }

function preprocess(argv: string[]): string[] {
	const creds = new Set(["--pattern", "--pin", "--password"]);
	const out: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (creds.has(a)) {
			const next = argv[i + 1];
			out.push(next === undefined || next.startsWith("-") ? `${a}=${ASK}` : a);
		} else out.push(a);
	}
	return out;
}

function loadRegistry(path?: string): Registry {
	const p = path || process.env.ADB_UNLOCK_DEVICES || "devices.json";
	return existsSync(p) ? parseRegistry(readFileSync(p, "utf8")) : {};
}

async function resolveCredential(
	values: Record<string, unknown>, name: string, profile: DeviceProfile,
): Promise<{ type: CredType; value: string; source: string }> {
	for (const t of ["pattern", "pin", "password"] as CredType[]) {
		const v = values[t] as string | undefined;
		if (v !== undefined) {
			const val = v === ASK ? await promptHidden(`${t} for ${name} (hidden): `) : v;
			if (!val) die("empty credential");
			return { type: t, value: val, source: "direct" };
		}
	}
	if (!bwUnlocked()) {
		die("bitwarden vault is locked. unlock it, or pass a credential directly with --pattern/--pin/--password.");
	}
	const fields = bwItemFields(profile.bw_item ?? name);
	const r = resolveCredentialType(fields, values.type as CredType | undefined);
	return { ...r, source: "bitwarden" };
}

function verifyCredential(dev: Device, cred: string): boolean {
	const out = dev.sh(`locksettings verify --old '${cred}'\n`, { asRoot: true });
	dev.cleanLogcat();
	return out.includes("verified successfully");
}

function removeLock(dev: Device, cred: string): boolean {
	const out = dev.sh(`locksettings clear --old '${cred}'\n`, { asRoot: true });
	dev.cleanLogcat();
	const chk = dev.sh(
		"locksettings get-disabled 2>/dev/null; dumpsys lock_settings 2>/dev/null | grep -m1 CredentialType\n",
		{ asRoot: true });
	return chk.includes("NONE") || /success/i.test(out);
}

async function injectPattern(dev: Device, cred: string, dry: boolean): Promise<void> {
	dev.sh(raiseBouncerScript());
	const xml = dev.sh("uiautomator dump /sdcard/.au.xml >/dev/null 2>&1; cat /sdcard/.au.xml; rm -f /sdcard/.au.xml\n");
	const bounds = patternGridFromDump(xml);
	if (!bounds) die("no pattern grid in the accessibility tree (did the bouncer show? maybe the lock is not a pattern)");
	const digits = parsePatternDigits(cred);
	if (digits.length < 4) die("pattern shorter than 4 dots — probably a wrong value");
	log(`  grid: bounds=[${bounds.join(",")}]  pattern-dots=${digits.length}`);
	if (dry) return;
	dev.sh(buildPatternGesture(patternPoints(bounds), digits).join("\n") + "\n");
	await sleep(1000);
}

async function injectText(dev: Device, cred: string, dry: boolean): Promise<void> {
	dev.sh(raiseBouncerScript());
	if (dry) { log("  (dry-run: no text entered)"); return; }
	dev.sh(buildTextEntry(cred).join("\n") + "\n");
	await sleep(1000);
}

const HELP = `adb-unlock — inject a known pattern/PIN/password into a remote Android device

Usage: adb-unlock [device] [options]

Credential (one of; a bare flag prompts hidden):
  --pattern [VALUE]   pattern as position digits 1-9 (keypad order, 1=top-left)
  --pin [VALUE]       numeric PIN
  --password [VALUE]  text password
  --type TYPE         when reading from Bitwarden: pattern|pin|password

Transport:
  --transport ssh|adb        default ssh
  -s, --serial SERIAL        adb device serial (also env ANDROID_SERIAL)
  --ssh ALIAS                ssh host alias
  --via auto|root|rish|none  shell wrapper on device (default auto)
  --list                     list connected adb devices and exit

Other:
  --bw-item NAME     Bitwarden item name (default: device name)
  --devices PATH     device registry JSON (default ./devices.json or $ADB_UNLOCK_DEVICES)
  --no-verify        skip the root locksettings-verify pre-check
  --force            inject even during an active call
  --dry-run          recon only, no injection
  --remove-lock      remove the lock entirely (needs root)
  -h, --help

Requires 'adb' and/or 'ssh' on PATH. Credential never printed; logcat cleared after.`;

async function main() {
	const { values, positionals } = parseArgs({
		args: preprocess(process.argv.slice(2)),
		allowPositionals: true,
		options: {
			type: { type: "string" },
			ssh: { type: "string" },
			via: { type: "string" },
			transport: { type: "string" },
			serial: { type: "string", short: "s" },
			"bw-item": { type: "string" },
			devices: { type: "string" },
			pattern: { type: "string" },
			pin: { type: "string" },
			password: { type: "string" },
			"no-verify": { type: "boolean" },
			"remove-lock": { type: "boolean" },
			force: { type: "boolean" },
			"dry-run": { type: "boolean" },
			list: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});

	if (values.help) { console.log(HELP); return; }
	if (values.list) { process.stdout.write(adbDevices()); return; }

	const serial = (values.serial as string | undefined) ?? process.env.ANDROID_SERIAL;
	const transport = (values.transport as Transport | undefined)
		?? (serial ? "adb" : undefined);

	const name = positionals[0] ?? serial ?? values.ssh as string ?? "";
	if (!name && !serial) { console.log(HELP); process.exit(1); }

	const registry = loadRegistry(values.devices as string | undefined);
	const profile: DeviceProfile = { ...(registry[name] ?? {}) };
	if (values.ssh) profile.ssh = values.ssh as string;
	if (values.via) profile.via = values.via as Via;
	if (values["bw-item"]) profile.bw_item = values["bw-item"] as string;

	// friendly multi-device guard for adb without an explicit serial
	const effTransport = transport ?? profile.transport ?? "ssh";
	if (effTransport === "adb" && !serial && !profile.adb?.serial) {
		const devs = adbSerials().filter((d) => d.state === "device");
		if (devs.length > 1) {
			die("multiple adb devices connected — choose one with -s/--serial (or $ANDROID_SERIAL):\n  "
				+ devs.map((d) => d.serial).join("\n  "));
		}
	}

	const { type, value: cred, source } = await resolveCredential(values, name, profile);
	log(`device: ${name || "(adb)"}  ·  transport=${effTransport}  ·  type=${type}  ·  source=${source}`);

	const dev = new Device(name, profile, { transport, serial });
	dev.detect();
	log(`  root=${dev.root ? "yes" : "no"}  wrap=${dev.wrap || "none"}`);

	const st = parseRecon(dev.sh(reconScript()));
	log(`  keyguard=${st.keyguard ? "shown" : "dismissed"}  call=${st.call ? "active" : "none"}  size=${st.size}  top=${st.top}`);

	if (st.call && !values.force) die("active call on device — not injecting blind. end the call or use --force.");
	if (!st.keyguard && !values["remove-lock"]) { log("✓ device already unlocked (keyguard dismissed)."); return; }

	if (dev.root && !values["no-verify"]) {
		if (verifyCredential(dev, cred)) log("  ✓ credential verified via locksettings");
		else die(`credential (${source}) failed verify on device — stopping before injection (lockout risk).`);
	}
	if (values["remove-lock"] && !dev.root) die("--remove-lock needs root, none available.");

	if (st.keyguard) {
		if (type === "pattern") await injectPattern(dev, cred, !!values["dry-run"]);
		else await injectText(dev, cred, !!values["dry-run"]);
		dev.cleanLogcat();
		if (values["dry-run"]) { log("✓ dry-run done (nothing injected)."); return; }
		const st2 = parseRecon(dev.sh(reconScript()));
		if (st2.keyguard) die("injection did not dismiss the keyguard. check the lock type and value.");
		log(`✓ unlocked — keyguard dismissed, top=${st2.top}`);
	}

	if (values["remove-lock"]) {
		if (removeLock(dev, cred)) log("✓ lock removed (locksettings clear).");
		else die("remove-lock not confirmed — check manually.");
	}
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
