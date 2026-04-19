<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { getTreeItemState } from "./tree.svelte.js";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	type Props = WithElementRef<HTMLAttributes<HTMLButtonElement>> & {
		hasChildren?: boolean;
	};

	let {
		ref = $bindable(null),
		hasChildren = true,
		class: className,
		onclick: forwardedClick,
		...restProps
	}: Props = $props();

	const item = getTreeItemState();

	// Keep the item's notion of "has children" in sync with what the UI renders,
	// so <Tree.Item> can announce aria-expanded correctly.
	$effect(() => {
		item.hasChildren = hasChildren;
	});

	type BtnMouseEvent = MouseEvent & { currentTarget: EventTarget & HTMLButtonElement };

	function handleClick(e: BtnMouseEvent) {
		if (!hasChildren) return;
		item.open = !item.open;
		forwardedClick?.(e);
	}
</script>

<button
	bind:this={ref}
	type="button"
	data-slot="tree-indicator"
	data-tree-stop
	data-has-children={hasChildren}
	data-state={item.open ? "open" : "closed"}
	aria-label={item.open ? "Collapse" : "Expand"}
	onclick={handleClick}
	class={cn(
		"inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm",
		"text-muted-foreground hover:bg-accent hover:text-foreground",
		"data-[has-children=false]:pointer-events-none data-[has-children=false]:invisible",
		className
	)}
	{...restProps}
>
	<ChevronRightIcon
		class={cn(
			"size-3 transition-transform duration-150",
			item.open && "rotate-90"
		)}
	/>
</button>
