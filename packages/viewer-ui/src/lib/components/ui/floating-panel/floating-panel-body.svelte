<!--
@component
FloatingPanel.Body

Scrollable content area that collapses (`display: none`) when the parent
Root's `collapsed` state is true. Keeping DOM mounted across collapse
preserves scroll position and child state. Applies the Root's `maxHeight`
directly so the scrollbar always has a definite bound, regardless of how
flex sizing propagates from the Root.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { getFloatingPanelApi } from './context.svelte.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: Props = $props();

	const api = getFloatingPanelApi();
</script>

<div
	bind:this={ref}
	data-slot="floating-panel-body"
	data-state={api.collapsed ? 'collapsed' : 'expanded'}
	class={cn('min-h-0 overflow-y-auto', className, api.collapsed && 'hidden')}
	style:max-height={api.maxHeight}
	style:min-height={api.minHeight}
	{...restProps}
>
	{@render children?.()}
</div>
