<script lang="ts">
	import { formatPatternForDevice, adbUnlockCommand, type SecretKind } from '$lib/pattern/deviceSequence.js';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import PatternLock from '$lib/pattern/PatternLock.svelte';

	let kind: SecretKind = $state('pattern');
	let deviceName = $state('');

	let drawn: number[] = $state([]);
	let patternResetKey = $state(0);
	let showNumbers = $state(true);
	let showArrows = $state(true);

	let pinValue = $state('');
	let passwordValue = $state('');

	let copied: 'value' | 'command' | null = $state(null);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	let containerEl: HTMLDivElement | undefined = $state();
	let patternSize = $state(280);
	$effect(() => {
		if (!containerEl) return;
		const update = () => { patternSize = Math.min(360, containerEl!.clientWidth - 32); };
		update();
		const o = new ResizeObserver(update);
		o.observe(containerEl);
		return () => o.disconnect();
	});

	const value = $derived(
		kind === 'pattern' ? formatPatternForDevice(drawn) : kind === 'pin' ? pinValue : passwordValue
	);
	const command = $derived(adbUnlockCommand(kind, value, deviceName.trim() || '<device>'));
	const hasValue = $derived(value.length > 0);

	function handlePattern(indices: number[]) { drawn = indices; }
	function clearPattern() { drawn = []; patternResetKey += 1; }

	async function copy(what: 'value' | 'command', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => (copied = null), 1500);
		} catch { /* clipboard unavailable */ }
	}

	const inputClass =
		'w-full px-3 py-2 font-mono text-lg bg-(--color-surface) border border-(--color-surface-border) rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-(--color-primary)';
</script>

<div class="space-y-8" bind:this={containerEl}>
	<!-- Hero -->
	<section class="space-y-3">
		<h1 class="text-3xl font-bold">adb-unlock</h1>
		<p class="text-(--color-text-muted)">
			Inject a <strong>known</strong> pattern, PIN, or password into a remote Android device over
			ADB or SSH — dismissing the lock screen without touching it. Pattern coordinates are derived
			live from the accessibility tree (<code>uiautomator dump</code>), so it works across
			resolutions and OEM skins, and even when the touchscreen is dead.
		</p>
		<div class="bg-(--color-surface) border border-(--color-surface-border) rounded-(--radius-card) p-4">
			<code class="text-sm font-mono" dir="ltr">npx adb-unlock &lt;device&gt; --transport adb -s &lt;serial&gt;</code>
		</div>
		<p class="text-xs text-(--color-text-muted)">
			Requires <code>adb</code> and/or <code>ssh</code> on PATH. For your own devices only. Wrong
			attempts count toward the lockout — the CLI runs a <code>locksettings verify</code> pre-check
			when root is available.
		</p>
	</section>

	<!-- Converter -->
	<Card>
		<div class="space-y-6">
			<div class="space-y-1">
				<h2 class="text-xl font-semibold">Secret → device input</h2>
				<p class="text-sm text-(--color-text-muted)">
					Enter a secret and get the digit sequence and ready command to paste.
				</p>
			</div>

			<div class="flex flex-wrap gap-2">
				<Button variant={kind === 'pattern' ? 'primary' : 'secondary'} size="sm" onclick={() => (kind = 'pattern')}>Pattern</Button>
				<Button variant={kind === 'pin' ? 'primary' : 'secondary'} size="sm" onclick={() => (kind = 'pin')}>PIN</Button>
				<Button variant={kind === 'password' ? 'primary' : 'secondary'} size="sm" onclick={() => (kind = 'password')}>Password</Button>
			</div>

			<div class="space-y-2">
				<label class="text-sm font-medium text-(--color-text-muted)" for="device-name">Device name / alias (optional)</label>
				<input id="device-name" type="text" bind:value={deviceName} placeholder="my-tablet" dir="ltr"
					class="w-full px-3 py-2 font-mono text-sm bg-(--color-surface) border border-(--color-surface-border) rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-(--color-primary)" />
			</div>

			{#if kind === 'pattern'}
				<div class="space-y-3">
					<p class="text-sm text-center text-(--color-text-muted)">Draw your pattern</p>
					<div class="flex justify-center">
						{#key patternResetKey}
							<PatternLock mode="input" onPattern={handlePattern} size={patternSize} {showNumbers} {showArrows} />
						{/key}
					</div>
					<div class="flex flex-wrap items-center justify-center gap-4">
						<label class="flex items-center gap-2 text-sm text-(--color-text-muted) cursor-pointer">
							<input type="checkbox" bind:checked={showNumbers} class="accent-(--color-primary)" /> Show order
						</label>
						<label class="flex items-center gap-2 text-sm text-(--color-text-muted) cursor-pointer">
							<input type="checkbox" bind:checked={showArrows} class="accent-(--color-primary)" /> Show direction
						</label>
						<Button variant="ghost" size="sm" onclick={clearPattern} disabled={drawn.length === 0}>Clear</Button>
					</div>
				</div>
			{:else if kind === 'pin'}
				<div class="space-y-2">
					<label class="text-sm font-medium text-(--color-text-muted)" for="pin-input">PIN</label>
					<input id="pin-input" type="text" inputmode="numeric" bind:value={pinValue} dir="ltr" class="{inputClass} tracking-widest" />
				</div>
			{:else}
				<div class="space-y-2">
					<label class="text-sm font-medium text-(--color-text-muted)" for="password-input">Password</label>
					<input id="password-input" type="text" bind:value={passwordValue} dir="ltr" class={inputClass} />
				</div>
			{/if}

			{#if hasValue}
				<div class="space-y-4">
					{#if kind === 'pattern'}
						<div class="space-y-2">
							<div class="text-sm font-medium text-(--color-text-muted)">Device sequence</div>
							<div class="flex items-center gap-3">
								<code class="text-2xl font-mono tracking-[0.3em] text-(--color-primary)" dir="ltr">{value}</code>
								<Button variant="secondary" size="sm" onclick={() => copy('value', value)}>{copied === 'value' ? 'Copied!' : 'Copy'}</Button>
							</div>
							<p class="text-xs text-(--color-text-muted)">
								Position numbers (1 = top-left … 9 = bottom-right) — not the drawing order shown on the dots.
							</p>
						</div>
					{/if}
					<div class="space-y-2">
						<div class="text-sm font-medium text-(--color-text-muted)">Command</div>
						<div class="flex items-center gap-3">
							<code class="flex-1 px-3 py-2 overflow-x-auto text-sm font-mono bg-(--color-surface) border border-(--color-surface-border) rounded-(--radius-button)" dir="ltr">{command}</code>
							<Button variant="secondary" size="sm" onclick={() => copy('command', command)}>{copied === 'command' ? 'Copied!' : 'Copy'}</Button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</Card>

	<!-- Usage -->
	<Card>
		<div class="space-y-3">
			<h2 class="text-xl font-semibold">Usage</h2>
			<pre class="text-xs font-mono overflow-x-auto bg-(--color-surface-dim) p-3 rounded-(--radius-button)" dir="ltr">npx adb-unlock my-tablet --transport adb -s 10.0.0.5:5555
npx adb-unlock my-tablet --transport adb --pattern        # hidden prompt
npx adb-unlock --list                                      # connected adb devices
ANDROID_SERIAL=10.0.0.5:5555 npx adb-unlock my-tablet --transport adb</pre>
			<p class="text-sm text-(--color-text-muted)">
				Pattern dots are numbered 1-9 by position, left-to-right, top-to-bottom. Device selection
				follows <code>adb</code>: <code>-s</code>/<code>--serial</code> or <code>$ANDROID_SERIAL</code>.
			</p>
		</div>
	</Card>
</div>
