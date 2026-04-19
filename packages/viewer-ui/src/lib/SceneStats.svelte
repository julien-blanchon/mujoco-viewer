<!--
@component
SceneStats — bridges reactive sim state out of the <Canvas> / <MujocoPhysics>
subtree so DOM overlays (loading overlay, stats panel) can consume it.
Renders nothing. Must sit inside `<MujocoPhysics>`.

Writes directly into the shared `SceneState` store instead of using `bind:`
on individual fields — the bind: chain would travel through intermediate
ancestors (Tooltip.Provider, MujocoProvider, WhenReady, Canvas, …) and trip
Svelte 5's `ownership_invalid_binding` warning, since none of them declare
`scene` as bindable.
-->
<script lang="ts">
	import { useMujocoContext } from 'mujoco-svelte';
	import type { SceneState } from '$lib/stores/sceneState.svelte.js';

	export interface SceneStatsSnapshot {
		bodies: number;
		geoms: number;
		actuators: number;
		contacts: number;
		time: number;
	}

	let { scene }: { scene: SceneState } = $props();

	const sim = useMujocoContext();

	$effect(() => {
		scene.status = sim.status;
	});

	$effect(() => {
		scene.sceneError = sim.error;
	});

	$effect(() => {
		scene.loadProgress = sim.loadProgress;
	});

	$effect(() => {
		if (sim.status !== 'ready') {
			scene.stats = null;
			return;
		}
		scene.stats = {
			bodies: sim.bodies.length,
			geoms: sim.geoms.length,
			actuators: sim.actuators.length,
			contacts: sim.mjData?.ncon ?? 0,
			time: sim.time
		};
	});
</script>
