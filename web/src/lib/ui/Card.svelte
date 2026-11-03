<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLElement> {
		interactive?: boolean;
		selected?: boolean;
		children: Snippet;
	}

	let { interactive = false, selected = false, children, class: className = '', ...rest }: Props = $props();
</script>

<div
	class="bg-(--color-surface) border border-(--color-surface-border) rounded-(--radius-card) p-6
		{interactive ? 'cursor-pointer hover:border-(--color-primary)/50 hover:shadow-md transition-all' : ''}
		{selected ? 'border-(--color-primary) ring-2 ring-(--color-primary)/20' : ''}
		{className}"
	{...rest}
>
	{@render children()}
</div>
