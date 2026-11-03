# adb-unlock

Inject a **known** pattern / PIN / password into a **remote** Android device over
**ADB or SSH**, dismissing the lock screen without touching it.

Pattern coordinates are derived **live from the accessibility tree**
(`uiautomator dump`), not hardcoded — so it works across resolutions and OEM skins
(stock `lockPatternView`, OneUI / OxygenOS `colorLockPatternView`), and even when the
touchscreen is dead (`input` injects above the hardware layer).

> For **your own** devices. Wrong attempts count toward the lockout; when root is
> available the tool runs a `locksettings verify` pre-check and stops if the stored
> value is wrong. See also [prior art](./docs/prior-art.md) — this idea exists in
> other forms; the differentiators here are dynamic coordinates + SSH transport.

🔢 **Landing page** with a pattern → digit-sequence converter: `web/` (SvelteKit).

## Install / run

```bash
npx adb-unlock <device> --transport adb -s <serial>
```

Requires `adb` and/or `ssh` on PATH. No install needed via `npx`.

## Usage

```bash
# ADB, explicit serial (like `adb -s`)
npx adb-unlock my-tablet --transport adb -s 10.0.0.5:5555

# ANDROID_SERIAL env (adb's native var) is honored
ANDROID_SERIAL=10.0.0.5:5555 npx adb-unlock my-tablet --transport adb

# SSH transport (e.g. Termux over a VPN) — the default
npx adb-unlock my-tablet --ssh my-tablet-alias

# Direct credential; a bare flag prompts hidden (not in ps/history)
npx adb-unlock my-tablet --transport adb -s SERIAL --pattern 583
npx adb-unlock my-tablet --transport adb -s SERIAL --pin

# List connected adb devices
npx adb-unlock --list

# Recon only
npx adb-unlock my-tablet --transport adb -s SERIAL --dry-run

# Remove the lock entirely (needs root)
npx adb-unlock my-tablet --transport adb -s SERIAL --remove-lock
```

### Pattern numbering

Dots are numbered **1-9 by position**, left-to-right, top-to-bottom
(1 = top-left, 9 = bottom-right) — the same order Android's grid uses. This is **not**
the order you drew them. The landing page converter turns a drawn pattern into this
sequence for you.

### Device selection (ADB)

`-s` / `--serial`, or `$ANDROID_SERIAL`. With multiple devices connected and no serial,
the tool lists them and asks you to choose (same as `adb`).

## Credential sources (in priority order)

1. Direct flag with a value: `--pattern 583` / `--pin 4721` / `--password hunter2`.
2. Bare flag → hidden prompt: `--pattern` (nothing printed, nothing in shell history).
3. Bitwarden (optional): an item per device with hidden fields
   `screen-lock-pattern` / `screen-lock-pin` / `screen-lock-password`
   (needs the `bw-mcp-cli` wrapper and an unlocked vault).

## Device registry (optional) — `devices.json`

Non-secret: transport + connection + shell wrapper. See `devices.json.example`.
Path from `--devices`, or `$ADB_UNLOCK_DEVICES`, or `./devices.json`.

## Transports

| transport | how |
|---|---|
| `ssh`  | `ssh <alias> "<wrap> sh"` |
| `adb`  | `adb -s <serial> shell "<wrap> sh"` (auto-runs `adb connect` for `ip:port` serials) |
| `adb` via a jump host | `ssh <host> "[pct exec <ct> --] adb -s <serial> shell <wrap> sh"` |

`<wrap>` = `su -c` (root), `$HOME/rish -c` (Shizuku), or none — chosen by `--via`
(default `auto`). Root is needed only for the `verify` pre-check and `--remove-lock`.

## Safety

- Wrong pattern/PIN attempts count toward the 5-try lockout — root `locksettings verify`
  pre-check stops before injecting a wrong value (`--no-verify` to skip).
- Never injects during an active call (unless `--force`).
- Confirms success via `isKeyguardShowing=false`, not assumption.
- The credential is never printed or written to disk; `logcat` is cleared afterward.

## Architecture

Functional core / imperative shell: `src/core/` is pure (grid math, script builders,
output parsing, transport argv) with unit tests; `src/shell/` does IO (`child_process`
for ssh/adb, Bitwarden, hidden prompt); `src/cli.ts` orchestrates.

```bash
npm test        # vitest on core/
npm run build   # esbuild -> dist/cli.js
```

## License

MIT
