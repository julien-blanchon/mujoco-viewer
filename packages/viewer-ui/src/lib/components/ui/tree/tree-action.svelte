<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type Props = WithElementRef<HTMLButtonAttributes> & {
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		children,
		onclick,
		...restProps
	}: Props = $props();

	function handleClick(e: MouseEvent) {
		// Actions belong to the row but shouldn't toggle selection.
		e.stopPropagation();
		onclick?.(e as MouseEvent & { currentTarget: EventTarget & HTMLButtonElement });
	}
</script>

<button
	bind:this={ref}
	type="button"
	data-slot="tree-action"
	data-tree-stop
	onclick={handleClick}
	class={cn(
		"inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm",
		"text-muted-foreground hover:bg-accent hover:text-foreground",
		"focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
		"group-data-[selected=true]/tree-row:text-primary-foreground group-data-[selected=true]/tree-row:hover:bg-primary-foreground/10",
		"disabled:pointer-events-none disabled:opacity-50",
		"[&>svg]:size-3.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
