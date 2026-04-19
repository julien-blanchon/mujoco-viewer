<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import PaneLabel from './pane-label.svelte';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Left-side label. Omit for a full-width row (e.g. button grids). */
		label?: string;
		/** Override the label column with a custom snippet. */
		labelSlot?: Snippet;
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		label,
		labelSlot,
		children,
		...restProps
	}: Props = $props();

	const hasLabel = $derived(!!labelSlot || label !== undefined);
</script>

<div
	bind:this={ref}
	data-slot="pane-row"
	data-has-label={hasLabel}
	class={cn(
		'grid h-6 items-center gap-2 px-2 text-xs',
		'data-[has-label=true]:grid-cols-[40%_1fr] data-[has-label=false]:grid-cols-1',
		className
	)}
	{...restProps}
>
	{#if labelSlot}
		{@render labelSlot()}
	{:else if label !== undefined}
		<PaneLabel>{label}</PaneLabel>
	{/if}
	{@render children?.()}
</div>
