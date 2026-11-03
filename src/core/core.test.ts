import { describe, it, expect } from "vitest";
import {
	patternGridFromDump, patternPoints, buildPatternGesture,
	buildTextEntry, parsePatternDigits, raiseLoopScript,
} from "./bouncer.js";
import { parseRecon, parseSize } from "./recon.js";
import { resolveCredentialType } from "./credential.js";
import { patternIndicesToDeviceDigits } from "./schema.js";
import { buildInvocation, buildAdbConnect, chooseWrap } from "./transport.js";

describe("bouncer", () => {
	it("grid from lockPatternView (stock)", () => {
		expect(patternGridFromDump('<node resource-id="com.android.systemui:id/lockPatternView" bounds="[273,992][926,1645]" />'))
			.toEqual([273, 992, 926, 1645]);
	});
	it("grid from colorLockPatternView (OxygenOS)", () => {
		expect(patternGridFromDump('<node resource-id="x:id/colorLockPatternView" bounds="[10,20][210,220]"/>'))
			.toEqual([10, 20, 210, 220]);
	});
	it("grid by content-desc fallback", () => {
		expect(patternGridFromDump('<node content-desc="אזור תבנית" bounds="[1,2][3,4]"/>')).toEqual([1, 2, 3, 4]);
	});
	it("no grid -> null", () => {
		expect(patternGridFromDump('<node resource-id="x" bounds="[0,0][1,1]"/>')).toBeNull();
	});
	it("rejects full-screen container, prefers square grid", () => {
		const xml = '<node resource-id="z:id/oplusos_kgd_security_pattern_view" bounds="[0,0][1272,2772]"/>'
			+ '<node resource-id="z:id/colorLockPatternView" bounds="[200,900][900,1600]"/>';
		expect(patternGridFromDump(xml)).toEqual([200, 900, 900, 1600]);
	});
	it("full-screen-only container -> null (no wrong coords)", () => {
		expect(patternGridFromDump('<node resource-id="z:id/oplusos_kgd_security_pattern_view" bounds="[0,0][1272,2772]"/>')).toBeNull();
	});
	it("points row-major corners", () => {
		const p = patternPoints([273, 992, 926, 1645]);
		expect(p[1]).toEqual([381, 1100]);
		expect(p[5]).toEqual([599, 1318]);
		expect(p[9]).toEqual([817, 1536]);
	});
	it("parse digits filters non 1-9", () => {
		expect(parsePatternDigits("1-2-3-6")).toEqual([1, 2, 3, 6]);
	});
	it("gesture DOWN/MOVE/UP", () => {
		const g = buildPatternGesture(patternPoints([0, 0, 300, 300]), [1, 2, 3]);
		expect(g[0]).toMatch(/^input motionevent DOWN /);
		expect(g.filter((l) => l.startsWith("input motionevent MOVE")).length).toBe(2);
		expect(g.at(-1)).toMatch(/^input motionevent UP /);
	});
	it("text entry escapes space", () => {
		expect(buildTextEntry("a b")).toEqual(["input text 'a%sb'", "sleep 0.3", "input keyevent KEYCODE_ENTER"]);
	});
});

describe("recon", () => {
	it("parses keyguard/call/size/top", () => {
		expect(parseRecon("KG=isKeyguardShowing=true\nCALL=mCallState=0\nSIZE=1200x1920\nTOP=topResumedActivity=foo\n"))
			.toEqual({ keyguard: true, call: false, size: "1200x1920", top: "topResumedActivity=foo" });
	});
	it("active call", () => {
		expect(parseRecon("CALL=mCallState=2\n").call).toBe(true);
	});
});

describe("credential", () => {
	it("auto-detect by priority", () => {
		expect(resolveCredentialType({ "screen-lock-pattern": "1236" })).toEqual({ type: "pattern", value: "1236" });
		expect(resolveCredentialType({ "screen-lock-pin": "4721" })).toEqual({ type: "pin", value: "4721" });
	});
	it("explicit missing throws", () => {
		expect(() => resolveCredentialType({ "screen-lock-pin": "1" }, "pattern")).toThrow();
	});
});

describe("transport", () => {
	it("chooseWrap", () => {
		expect(chooseWrap({ root: true, rish: false }, "auto")).toBe("su -c");
		expect(chooseWrap({ root: false, rish: true }, "auto")).toBe("$HOME/rish -c");
		expect(chooseWrap({ root: false, rish: false }, "none")).toBe("");
	});
	it("ssh invocation", () => {
		expect(buildInvocation("liam", { ssh: "liam" }, "su -c")).toEqual(["ssh", "-o", "ConnectTimeout=12", "liam", "su -c sh"]);
	});
	it("adb invocation with serial", () => {
		expect(buildInvocation("d", {}, "", { transport: "adb", serial: "1.2.3.4:5555" }))
			.toEqual(["adb", "-s", "1.2.3.4:5555", "shell", "sh"]);
	});
	it("adb invocation without serial (single device)", () => {
		expect(buildInvocation("d", { transport: "adb" }, "su -c")).toEqual(["adb", "shell", "su -c sh"]);
	});
	it("adb via proxmox host", () => {
		expect(buildInvocation("d", { adb: { sshHost: "pve", ct: 115 } }, "", { transport: "adb", serial: "1.2.3.4:5555" }))
			.toEqual(["ssh", "-o", "ConnectTimeout=12", "pve", "pct exec 115 -- adb -s 1.2.3.4:5555 shell sh"]);
	});
	it("adb connect when serial has ip", () => {
		expect(buildAdbConnect({}, { transport: "adb", serial: "10.0.0.5:5555" })).toEqual(["adb", "connect", "10.0.0.5:5555"]);
	});
	it("no connect for ssh", () => {
		expect(buildAdbConnect({ ssh: "x" }, { transport: "ssh" })).toBeNull();
	});
});

describe("device-digits (shared with landing page)", () => {
	it("index+1 row-major", () => {
		expect(patternIndicesToDeviceDigits([4, 7, 2])).toBe("583");
	});
});

describe("raise bouncer (proportional)", () => {
	it("scales swipe to screen size, retries, probes for the grid", () => {
		const sc = raiseLoopScript({ w: 1272, h: 2772 }, "pattern");
		expect(sc).toContain("wm dismiss-keyguard");
		expect(sc).toContain("input swipe 636 2495 636 554 150");
		expect(sc).toContain("for a in 1 2 3 4");  // outer raise retry
		expect(sc).toContain("for d in 1 2");  // inner dump retry (idle-state flake)
		expect(sc).toContain("patternview");
	});
	it("parseSize", () => {
		expect(parseSize("1272x2772")).toEqual({ w: 1272, h: 2772 });
		expect(parseSize("")).toBeNull();
	});
});
