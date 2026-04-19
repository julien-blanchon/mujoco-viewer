<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { getTreeItemState } from "./tree.svelte.js";

	type Props = WithElementRef<HTMLAttributes<HTMLUListElement>> & {
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: Props = $props();

	const item = getTreeItemState();
</script>

{#if item.open}
	<ul
		bind:this={ref}
		data-slot="tree-item-content"
		role="group"
		class={cn("m-0 list-none p-0", className)}
		{...restProps}
	>
		{@render children?.()}
	</ul>
{/if}
