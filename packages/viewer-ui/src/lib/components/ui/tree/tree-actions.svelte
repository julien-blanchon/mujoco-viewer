<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		children?: Snippet;
		/** Show actions even when the row isn't hovered/selected. */
		alwaysVisible?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		children,
		alwaysVisible = false,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="tree-actions"
	data-tree-stop
	data-always-visible={alwaysVisible}
	class={cn(
		"ml-auto flex shrink-0 items-center gap-0.5 transition-opacity",
		!alwaysVisible && [
			"opacity-0",
			"group-hover/tree-row:opacity-100",
			"group-focus-within/tree-row:opacity-100",
			"group-data-[selected=true]/tree-row:opacity-100",
		],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
