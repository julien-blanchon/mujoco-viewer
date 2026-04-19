<script
	lang="ts"
	generics="TValue extends string | number = string"
>
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import {
		getTreeState,
		setTreeItemState,
		TreeItemState,
		getDepth,
		setDepth,
	} from "./tree.svelte.js";

	type Props = WithElementRef<HTMLAttributes<HTMLLIElement>> & {
		value: TValue;
		open?: boolean;
		depth?: number;
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		value,
		open = $bindable<boolean>(true),
		depth: depthProp,
		class: className,
		children,
		...restProps
	}: Props = $props();

	const tree = getTreeState<TValue>();
	const parentDepth = getDepth();
	const depth = $derived(depthProp ?? parentDepth + 1);
	// Depth stays stable per item lifecycle (items are keyed by id), so capturing
	// the initial value for the child context is exactly what we want.
	// svelte-ignore state_referenced_locally
	setDepth(depth);

	const itemState = setTreeItemState(
		new TreeItemState<TValue>({
			value: () => value,
			depth: () => depth,
			open: () => open,
			setOpen: (v) => (open = v),
		})
	);
</script>

<li
	bind:this={ref}
	data-slot="tree-item"
	role="treeitem"
	data-depth={depth}
	data-selected={tree.isSelected(value)}
	data-state={itemState.open ? "open" : "closed"}
	aria-expanded={itemState.hasChildren ? itemState.open : undefined}
	aria-selected={tree.isSelected(value)}
	class={cn("group/tree-item list-none", className)}
	{...restProps}
>
	{@render children?.()}
</li>
