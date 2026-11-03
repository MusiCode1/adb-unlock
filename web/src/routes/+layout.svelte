<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>adb-unlock — pattern to device sequence</title>
	<meta name="description" content="Turn a known Android lock pattern / PIN / password into the digit sequence and command for the adb-unlock CLI." />
</svelte:head>

<div class="min-h-screen bg-(--color-surface-dim)">
	<header class="border-b border-(--color-surface-border) bg-(--color-surface)">
		<div class="max-w-2xl mx-auto px-(--spacing-page) py-3 flex items-center justify-between">
			<span class="text-lg font-semibold text-(--color-text)">adb-unlock</span>
			<a href="https://github.com/MusiCode1/adb-unlock" class="text-sm text-(--color-text-muted) hover:text-(--color-text) no-underline transition-colors">GitHub</a>
		</div>
	</header>
	<main class="max-w-2xl mx-auto px-(--spacing-page) py-8">
		{@render children()}
	</main>
</div>
