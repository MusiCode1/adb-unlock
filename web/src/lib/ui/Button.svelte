<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		children: Snippet;
	}

	let { variant = 'primary', size = 'md', children, class: className = '', ...rest }: Props = $props();

	const baseClasses = 'inline-flex items-center justify-center font-medium transition-colors rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary) disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

	const variantClasses = {
		primary: 'bg-(--color-primary) text-white hover:bg-(--color-primary-hover)',
		secondary: 'bg-(--color-surface) text-(--color-text) border border-(--color-surface-border) hover:bg-(--color-surface-dim)',
		ghost: 'text-(--color-text-muted) hover:bg-(--color-surface-dim) hover:text-(--color-text)',
		danger: 'bg-(--color-error) text-white hover:bg-(--color-error)/90'
	};

	const sizeClasses = {
		sm: 'text-sm px-3 py-1.5 gap-1.5',
		md: 'text-sm px-4 py-2 gap-2',
		lg: 'text-base px-6 py-3 gap-2'
	};
</script>

<button class="{baseClasses} {variantClasses[variant]} {sizeClasses[size]} {className}" {...rest}>
	{@render children()}
</button>
