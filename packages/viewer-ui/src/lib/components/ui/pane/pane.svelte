<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title?: string;
		header?: Snippet;
		/** `card` = standalone with bg/ring/radius (default). `flat` = no
		 *  chrome, for when Pane is nested inside another card-like surface
		 *  (e.g. a FloatingPanel). */
		variant?: 'card' | 'flat';
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		title,
		header,
		variant = 'card',
		children,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="pane"
	data-variant={variant}
	class={cn(
		'flex flex-col',
		variant === 'card'
			? 'bg-card text-card-foreground ring-foreground/10 overflow-hidden rounded-lg ring-1'
			: 'border-border border-b last-of-type:border-b-0',
		className
	)}
	{...restProps}
>
	{#if header}
		{@render header()}
	{:else if title}
		<div
			data-slot="pane-header"
			class={cn(
				'text-foreground flex h-7 items-center text-[11px] font-medium tracking-wide uppercase',
				variant === 'card'
					? 'border-border border-b px-2.5'
					: 'text-muted-foreground bg-muted/40 px-2.5 text-[10px] tracking-wider'
			)}
		>
			{title}
		</div>
	{/if}
	<div data-slot="pane-body" class="flex flex-col gap-0.5 py-1">
		{@render children?.()}
	</div>
</div>
