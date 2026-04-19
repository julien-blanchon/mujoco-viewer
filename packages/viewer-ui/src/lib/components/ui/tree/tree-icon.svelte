<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type Props = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<span
	bind:this={ref}
	data-slot="tree-icon"
	class={cn(
		"inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground",
		"group-data-[selected=true]/tree-row:text-primary-foreground",
		"[&>svg]:size-3.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</span>
