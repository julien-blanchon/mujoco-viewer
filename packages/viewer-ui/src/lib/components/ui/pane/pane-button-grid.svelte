<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { Button, type ButtonVariant } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	type Props = WithElementRef<Omit<HTMLAttributes<HTMLDivElement>, 'onclick'>> & {
		/** Labels rendered as equally-sized buttons in a horizontal row. */
		buttons: readonly string[];
		/** Optional per-button tooltips (same length as buttons). Empty strings skip the tooltip. */
		tooltips?: readonly string[];
		onclick?: (index: number) => void;
		/** Optional label column on the left (mirrors PaneRow layout). */
		label?: string;
		variant?: ButtonVariant;
		disabled?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		buttons,
		tooltips,
		onclick,
		label,
		variant = 'secondary',
		disabled,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="pane-button-grid"
	data-has-label={label !== undefined}
	class={cn(
		'grid items-center gap-2 px-2 py-0.5 text-xs',
		label !== undefined ? 'grid-cols-[40%_1fr]' : 'grid-cols-1',
		className
	)}
	{...restProps}
>
	{#if label !== undefined}
		<span
			data-slot="pane-label"
			class="text-muted-foreground truncate text-[11px] select-none"
		>
			{label}
		</span>
	{/if}
	<div
		class="grid gap-1"
		style:grid-template-columns="repeat({buttons.length}, minmax(0, 1fr))"
	>
		{#each buttons as btn, i (i)}
			{@const tip = tooltips?.[i]}
			{#if tip}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{variant}
								size="xs"
								{disabled}
								onclick={() => onclick?.(i)}
								class="h-6 w-full min-w-0 px-1 text-[11px]"
								{...props}
							>
								<span class="truncate">{btn}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{tip}</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<Button
					{variant}
					size="xs"
					{disabled}
					onclick={() => onclick?.(i)}
					class="h-6 w-full min-w-0 px-1 text-[11px]"
				>
					<span class="truncate">{btn}</span>
				</Button>
			{/if}
		{/each}
	</div>
</div>
