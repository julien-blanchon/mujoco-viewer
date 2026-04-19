<!--
@component
TendonInspector — color swatch + live length with range needle. Width /
range / rgba attributes come from the `AttrEditList`.
-->
<script lang="ts">
	import type { MujocoSimState, TendonInfo } from 'mujoco-svelte';

	type Props = {
		sim: MujocoSimState;
		info: TendonInfo;
	};

	let { sim, info }: Props = $props();

	const swatch = $derived(
		`rgba(${Math.round(info.rgba[0] * 255)}, ${Math.round(info.rgba[1] * 255)}, ${Math.round(info.rgba[2] * 255)}, ${info.rgba[3].toFixed(2)})`
	);
	const limited = $derived(info.range[1] > info.range[0]);

	let length = $state(0);

	$effect(() => {
		void sim.time;
		const d = sim.mjData;
		if (!d?.ten_length) return;
		length = d.ten_length[info.id] ?? 0;
	});

	const needle = $derived.by(() => {
		if (!limited) return null;
		const [lo, hi] = info.range;
		const t = (length - lo) / (hi - lo);
		return Math.max(0, Math.min(1, t));
	});
</script>

<div class="mb-2 h-9 rounded border border-border" style:background={swatch}></div>

<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Live</h4>
<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
	<dt class="text-muted-foreground">length</dt>
	<dd class="m-0 text-foreground">{length.toFixed(4)}</dd>
</dl>

{#if needle !== null}
	<div
		class="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
		title="Current length within tendon range"
	>
		<span>{info.range[0].toFixed(2)}</span>
		<div class="relative h-1.5 rounded-[3px] border border-border bg-muted">
			<div
				class="absolute top-0 bottom-0 w-[3px] -translate-x-px rounded-[2px] bg-primary"
				style:left="{needle * 100}%"
			></div>
		</div>
		<span>{info.range[1].toFixed(2)}</span>
	</div>
{/if}
