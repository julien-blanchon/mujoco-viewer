<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { getTreeState, getTreeItemState } from "./tree.svelte.js";

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
		/** When false (e.g. for section headers) the row toggles expansion instead of changing selection. */
		selectable?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		children,
		selectable = true,
		onclick: forwardedClick,
		onkeydown: forwardedKeydown,
		...restProps
	}: Props = $props();

	const tree = getTreeState();
	const item = getTreeItemState();

	type DivMouseEvent = MouseEvent & { currentTarget: EventTarget & HTMLDivElement };
	type DivKeyboardEvent = KeyboardEvent & {
		currentTarget: EventTarget & HTMLDivElement;
	};

	function activate() {
		if (selectable) tree.select(item.value);
		else if (item.hasChildren) item.open = !item.open;
	}

	function handleClick(e: DivMouseEvent) {
		// Don't steal clicks from inline controls (chevron, actions, input).
		if ((e.target as HTMLElement).closest("[data-tree-stop]")) return;
		if (tree.isEditing(item.value)) return;
		activate();
		forwardedClick?.(e);
	}

	function focusSibling(e: DivKeyboardEvent, direction: -1 | 1) {
		// Claim the key regardless of whether we find a sibling so the outer
		// page doesn't scroll when we're already at the first / last row.
		e.preventDefault();
		// Navigate the flat DOM order of every visible tree row, regardless of
		// nesting. `[role="tree"]` scopes the query so adjacent trees (e.g.
		// two panels open side-by-side) don't leak focus into each other.
		const host = e.currentTarget.closest<HTMLElement>('[role="tree"]');
		const rows = Array.from(
			(host ?? document).querySelectorAll<HTMLElement>(
				'[data-slot="tree-item-row"]',
			),
		);
		const idx = rows.indexOf(e.currentTarget);
		if (idx === -1) return;
		const next = rows[idx + direction];
		if (next) next.focus();
	}

	function handleKeydown(e: DivKeyboardEvent) {
		if (tree.isEditing(item.value)) return;
		forwardedKeydown?.(e);
		if (e.defaultPrevented) return;

		switch (e.key) {
			case "Enter":
			case " ":
				e.preventDefault();
				activate();
				break;
			case "F2":
				if (selectable) {
					e.preventDefault();
					tree.startEdit(item.value);
				}
				break;
			case "ArrowRight":
				if (item.hasChildren && !item.open) {
					e.preventDefault();
					item.open = true;
				}
				break;
			case "ArrowLeft":
				if (item.hasChildren && item.open) {
					e.preventDefault();
					item.open = false;
				}
				break;
			case "ArrowDown":
				focusSibling(e, 1);
				break;
			case "ArrowUp":
				focusSibling(e, -1);
				break;
			case "Home": {
				const host = e.currentTarget.closest<HTMLElement>('[role="tree"]');
				const first = (host ?? document).querySelector<HTMLElement>(
					'[data-slot="tree-item-row"]',
				);
				if (first) {
					e.preventDefault();
					first.focus();
				}
				break;
			}
			case "End": {
				const host = e.currentTarget.closest<HTMLElement>('[role="tree"]');
				const rows = (host ?? document).querySelectorAll<HTMLElement>(
					'[data-slot="tree-item-row"]',
				);
				const last = rows[rows.length - 1];
				if (last) {
					e.preventDefault();
					last.focus();
				}
				break;
			}
		}
	}
</script>

<div
	bind:this={ref}
	data-slot="tree-item-row"
	data-selectable={selectable}
	data-selected={selectable && tree.isSelected(item.value)}
	data-depth={item.depth}
	tabindex={0}
	role="button"
	style:padding-left="{8 + item.depth * 14}px"
	onclick={handleClick}
	onkeydown={handleKeydown}
	class={cn(
		"group/tree-row relative flex h-6 cursor-pointer items-center gap-1 rounded-sm pr-1 text-xs",
		"hover:bg-muted",
		"data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
		"focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
