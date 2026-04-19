<!--
@component
FloatingPanel.Header

Draggable title bar. Click the chevron to collapse, the X to close
(only rendered when the parent Root is `closable`). Custom action buttons
can be injected via the `actions` snippet.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import { getFloatingPanelApi } from './context.svelte.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title?: string;
		/** Replaces the default title rendering (e.g. for icons, badges). */
		titleSnippet?: Snippet;
		/** Extra buttons rendered before collapse/close. */
		actions?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		title,
		titleSnippet,
		actions,
		...restProps
	}: Props = $props();

	const api = getFloatingPanelApi();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={ref}
	data-slot="floating-panel-header"
	class={cn(
		'border-border text-foreground flex h-8 shrink-0 items-center gap-1 border-b px-1.5 text-[11px] font-medium tracking-wide uppercase',
		'cursor-grab active:cursor-grabbing touch-none',
		className
	)}
	onpointerdown={api.startDrag}
	ondblclick={api.resetPosition}
	title="Drag to move · double-click to reset"
	{...restProps}
>
	<button
		type="button"
		data-slot="floating-panel-collapse"
		onpointerdown={(e) => e.stopPropagation()}
		ondblclick={(e) => e.stopPropagation()}
		onclick={api.toggleCollapsed}
		aria-label={api.collapsed ? 'Expand' : 'Collapse'}
		class={cn(
			'hover:bg-accent text-muted-foreground hover:text-foreground flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none',
			'focus-visible:ring-ring focus-visible:ring-2'
		)}
	>
		<ChevronDownIcon
			class={cn('size-3.5 transition-transform duration-150', api.collapsed && '-rotate-90')}
		/>
	</button>

	<div data-slot="floating-panel-title" class="min-w-0 flex-1 truncate px-1">
		{#if titleSnippet}
			{@render titleSnippet()}
		{:else}
			{title ?? ''}
		{/if}
	</div>

	{#if actions}
		<div
			data-slot="floating-panel-actions"
			class="flex items-center gap-0.5"
			onpointerdown={(e) => e.stopPropagation()}
			ondblclick={(e) => e.stopPropagation()}
			role="toolbar"
			tabindex="-1"
		>
			{@render actions()}
		</div>
	{/if}

	{#if api.closable}
		<button
			type="button"
			data-slot="floating-panel-close"
			onpointerdown={(e) => e.stopPropagation()}
			ondblclick={(e) => e.stopPropagation()}
			onclick={api.close}
			aria-label="Close panel"
			class={cn(
				'hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none',
				'focus-visible:ring-ring focus-visible:ring-2'
			)}
		>
			<XIcon class="size-3.5" />
		</button>
	{/if}
</div>
