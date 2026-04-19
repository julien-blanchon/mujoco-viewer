<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import PaneRow from './pane-row.svelte';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		/** Number of decimal places shown in the readout. */
		precision?: number;
		disabled?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		label,
		value = $bindable(0),
		min = 0,
		max = 1,
		step = 0.01,
		precision,
		disabled,
		...restProps
	}: Props = $props();

	const inferredPrecision = $derived(
		precision ?? Math.max(0, Math.min(6, -Math.floor(Math.log10(Math.max(step, 1e-9)))))
	);
	const readout = $derived(Number.isFinite(value) ? value.toFixed(inferredPrecision) : '—');
</script>

<PaneRow bind:ref {label} class={cn('data-[has-label=true]:grid-cols-[40%_1fr]', className)} {...restProps}>
	<div data-slot="pane-slider-control" class="flex min-w-0 items-center gap-2">
		<Slider
			type="single"
			bind:value
			{min}
			{max}
			{step}
			{disabled}
			class="flex-1"
			aria-label={label}
		/>
		<span
			data-slot="pane-slider-readout"
			class="text-foreground w-12 shrink-0 text-right font-mono text-[11px] tabular-nums"
		>
			{readout}
		</span>
	</div>
</PaneRow>
