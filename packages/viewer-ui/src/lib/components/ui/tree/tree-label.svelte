<script lang="ts">
	import { tick } from "svelte";
	import type { HTMLAttributes, HTMLInputAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { getTreeItemState, getTreeState } from "./tree.svelte.js";

	type Props = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		value: string;
		editable?: boolean;
		inputClass?: string;
		inputProps?: HTMLInputAttributes;
	};

	let {
		ref = $bindable(null),
		value,
		editable = false,
		class: className,
		inputClass,
		inputProps,
		...restProps
	}: Props = $props();

	const tree = getTreeState();
	const item = getTreeItemState();
	const editing = $derived(editable && tree.isEditing(item.value));

	let draft = $state("");
	let inputEl: HTMLInputElement | null = $state(null);

	// When editing begins, seed the draft and focus/select the input.
	$effect(() => {
		if (editing) {
			draft = value;
			void tick().then(() => {
				inputEl?.focus();
				inputEl?.select();
			});
		}
	});

	function commit() {
		const next = draft.trim();
		if (next.length === 0 || next === value) {
			tree.cancelEdit();
			return;
		}
		tree.commitEdit(next);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			commit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			tree.cancelEdit();
		}
	}

	function onLabelDblClick(e: MouseEvent) {
		if (!editable) return;
		e.preventDefault();
		e.stopPropagation();
		tree.startEdit(item.value);
	}
</script>

{#if editing}
	<input
		bind:this={inputEl}
		bind:value={draft}
		type="text"
		data-slot="tree-label-input"
		data-tree-stop
		onkeydown={onKeydown}
		onblur={commit}
		onclick={(e) => e.stopPropagation()}
		ondblclick={(e) => e.stopPropagation()}
		class={cn(
			"bg-background text-foreground ring-ring h-5 min-w-0 flex-1 rounded-sm px-1 text-xs outline-none ring-1",
			inputClass
		)}
		{...inputProps}
	/>
{:else}
	<span
		bind:this={ref}
		data-slot="tree-label"
		data-editable={editable}
		ondblclick={onLabelDblClick}
		class={cn(
			"min-w-0 flex-1 truncate select-none",
			editable && "cursor-text",
			className
		)}
		{...restProps}
	>
		{value}
	</span>
{/if}
