<script
	lang="ts"
	generics="TValue extends string | number = string"
>
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { setTreeState, TreeState } from "./tree.svelte.js";

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		selected?: TValue | null;
		onRename?: (value: TValue, name: string) => void;
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		selected = $bindable<TValue | null>(null),
		onRename,
		children,
		...restProps
	}: Props = $props();

	setTreeState<TValue>(
		new TreeState<TValue>({
			selected: () => selected,
			setSelected: (v) => (selected = v),
			onRename: () => onRename,
		})
	);
</script>

<div
	bind:this={ref}
	data-slot="tree"
	role="tree"
	class={cn("flex flex-col gap-0.5 text-sm", className)}
	{...restProps}
>
	{@render children?.()}
</div>
