<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';

	type Props = {
		ref?: HTMLButtonElement | null;
		pressed?: boolean;
		onPressedChange?: (pressed: boolean) => void;
		class?: string;
		disabled?: boolean;
	};

	let {
		ref = $bindable(null),
		pressed = $bindable(true),
		onPressedChange,
		class: className,
		disabled
	}: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Toggle
				bind:ref
				bind:pressed
				{disabled}
				onPressedChange={(v) => onPressedChange?.(v)}
				size="sm"
				aria-label={pressed ? 'Hide' : 'Show'}
				data-slot="tree-visibility"
				data-tree-stop
				class={cn(
					'size-5 min-w-0 rounded-sm px-0',
					'text-muted-foreground hover:bg-accent hover:text-foreground',
					'data-[state=off]:opacity-60',
					'group-data-[selected=true]/tree-row:text-primary-foreground group-data-[selected=true]/tree-row:hover:bg-primary-foreground/10',
					"[&_svg:not([class*='size-'])]:size-3.5",
					className
				)}
				onclick={(e: MouseEvent) => e.stopPropagation()}
				{...props}
			>
				{#if pressed}
					<EyeIcon />
				{:else}
					<EyeOffIcon />
				{/if}
			</Toggle>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top">
		{pressed ? 'Hide' : 'Show'}
	</Tooltip.Content>
</Tooltip.Root>
