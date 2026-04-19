<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { LineChart } from 'layerchart';
	import PaneLabel from './pane-label.svelte';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		/** Current value. The monitor tracks changes over time when `graph` is true. */
		value: number | string;
		/** Render a scrolling line chart below the readout. Only numeric values are plotted. */
		graph?: boolean;
		/** Max number of samples retained in the scrolling buffer. */
		bufferSize?: number;
		/** Minimum ms between graph samples (throttle). 0 = sample on every change. */
		interval?: number;
		/** Decimals shown in the numeric readout. */
		precision?: number;
		/** Optional fixed y-axis domain; auto-scaled when omitted. */
		min?: number;
		max?: number;
	};

	let {
		ref = $bindable(null),
		class: className,
		label,
		value,
		graph = false,
		bufferSize = 120,
		interval = 100,
		precision = 3,
		min,
		max,
		...restProps
	}: Props = $props();

	type Sample = { t: number; v: number };

	// Keep the sample ring in a plain (non-reactive) array; publish to $state only
	// after each append so the chart gets a new reference without the effect
	// re-tracking itself.
	let buffer: Sample[] = [];
	let samples = $state<Sample[]>([]);
	let counter = 0;
	let lastSampleAt = 0;

	$effect(() => {
		const v = value;
		if (!graph || typeof v !== 'number' || !Number.isFinite(v)) return;
		const now = performance.now();
		if (interval > 0 && now - lastSampleAt < interval) return;
		lastSampleAt = now;
		counter++;
		buffer.push({ t: counter, v });
		if (buffer.length > bufferSize) buffer.splice(0, buffer.length - bufferSize);
		samples = buffer.slice();
	});

	const readout = $derived(
		typeof value === 'number'
			? Number.isFinite(value)
				? value.toFixed(precision)
				: String(value)
			: value
	);

	const yDomain = $derived(
		min !== undefined && max !== undefined ? ([min, max] as [number, number]) : undefined
	);

	const chartConfig = $derived<Chart.ChartConfig>({
		v: {
			label,
			color: 'var(--chart-1)'
		}
	});
</script>

<div
	bind:this={ref}
	data-slot="pane-monitor"
	data-graph={graph}
	class={cn('flex flex-col gap-1 px-2 py-0.5', className)}
	{...restProps}
>
	<div class="flex h-6 items-center justify-between gap-2">
		<PaneLabel>{label}</PaneLabel>
		<span
			data-slot="pane-monitor-readout"
			class="text-foreground shrink-0 font-mono text-[11px] tabular-nums"
		>
			{readout}
		</span>
	</div>
	{#if graph}
		<Chart.Container
			config={chartConfig}
			class="bg-muted/40 aspect-auto h-10 w-full overflow-hidden rounded-sm"
		>
			<LineChart
				data={samples}
				x="t"
				y="v"
				{yDomain}
				padding={{ top: 2, right: 2, bottom: 2, left: 2 }}
				series={[{ key: 'v', label, color: 'var(--chart-1)' }]}
				axis={false}
				legend={false}
				tooltipContext={false}
				highlight={false}
			/>
		</Chart.Container>
	{/if}
</div>
