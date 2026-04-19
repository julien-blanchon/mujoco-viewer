<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type Props = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		children?: Snippet;
	};

	let { ref = $bindable(null), class: className, children, ...restProps }: Props = $props();
</script>

<span
	bind:this={ref}
	data-slot="pane-label"
	class={cn('text-muted-foreground truncate text-[11px] select-none', className)}
	{...restProps}
>
	{@render children?.()}
</span>
