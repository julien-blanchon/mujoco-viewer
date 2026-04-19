<!--
@component
SensorInspector — live sensor readings (one Monitor graph per dimension).
Static attributes like `cutoff`, `noise` come from `AttrEditList`.

`dim` and `adr` aren't in the XML — they're runtime layout fields — so we
don't try to surface them here either; the addressable sensor data is the
only interesting thing at this level.
-->
<script lang="ts">
	import type { MujocoSimState, SensorInfo } from 'mujoco-svelte';
	import * as Pane from '$lib/components/ui/pane/index.js';

	type Props = {
		sim: MujocoSimState;
		info: SensorInfo;
	};

	let { sim, info }: Props = $props();

	let values = $state<number[]>([]);

	$effect(() => {
		values = Array.from({ length: info.dim }, () => 0);
	});

	$effect(() => {
		void sim.time;
		const data = sim.mjData;
		if (!data) return;
		for (let i = 0; i < info.dim; i++) {
			values[i] = data.sensordata[info.adr + i] ?? 0;
		}
	});

	const AXIS_LABELS = ['x', 'y', 'z', 'w'];
</script>

<Pane.Root>
	{#each values as v, i (i)}
		<Pane.Monitor value={v} label={AXIS_LABELS[i] ?? `[${i}]`} graph bufferSize={180} />
	{/each}
</Pane.Root>
