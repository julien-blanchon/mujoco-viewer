<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title: string;
		/** Lucide (or any Svelte) icon component rendered next to the title. */
		icon?: Component;
		open?: boolean;
		children?: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		title,
		icon: Icon,
		open = $bindable(true),
		children,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="pane-folder"
	data-state={open ? 'open' : 'closed'}
	class={cn('group/pane-folder border-border border-b last:border-b-0', className)}
	{...restProps}
>
	<Collapsible.Root bind:open>
		<Collapsible.Trigger
			data-slot="pane-folder-trigger"
			class={cn(
				'text-foreground hover:bg-muted/50 group flex h-6 w-full cursor-pointer items-center gap-1.5 px-2 text-[10px] font-medium tracking-wider uppercase transition-colors outline-none select-none',
				'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset'
			)}
		>
			<ChevronRightIcon
				class="text-muted-foreground size-3 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-90"
			/>
			{#if Icon}
				<Icon class="text-muted-foreground size-3.5 shrink-0" />
			{/if}
			<span class="truncate">{title}</span>
		</Collapsible.Trigger>
		<Collapsible.Content
			data-slot="pane-folder-content"
			class="overflow-hidden data-[state=closed]:hidden"
		>
			<div class="flex flex-col gap-0.5 py-1">
				{@render children?.()}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
</div>
