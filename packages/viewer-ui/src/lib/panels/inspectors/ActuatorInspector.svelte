<!--
@component
ActuatorInspector — live ctrl slider (reads + writes `data.ctrl`). All
static attributes (gear, ctrlrange, forcerange, gain/bias params, ...) come
from the generic `AttrEditList`.
-->
<script lang="ts">
	import type { ActuatorInfo, MujocoSimState } from 'mujoco-svelte';
	import * as Pane from '$lib/components/ui/pane/index.js';

	type Props = {
		sim: MujocoSimState;
		info: ActuatorInfo;
	};

	let { sim, info }: Props = $props();

	let ctrlValue = $state(0);

	$effect(() => {
		const data = sim.mjData;
		if (!data) return;
		ctrlValue = data.ctrl[info.id] ?? 0;
	});

	$effect(() => {
		const data = sim.mjData;
		if (!data) return;
		data.ctrl[info.id] = ctrlValue;
	});

	const hasRange = $derived(Number.isFinite(info.range[0]) && Number.isFinite(info.range[1]));
	const min = $derived(hasRange ? info.range[0] : -1);
	const max = $derived(hasRange ? info.range[1] : 1);
</script>

<Pane.Root>
	<Pane.Slider bind:value={ctrlValue} label="ctrl" {min} {max} step={(max - min) / 500} />
</Pane.Root>
