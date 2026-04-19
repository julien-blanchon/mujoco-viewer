<!--
@component
SimBridge

Exposes the canvas-internal `MujocoSimState` on the shared `SceneState` store
so DOM panels (tree, inspector, options panel, sim controls) that live
*outside* the Threlte `<Canvas>` can reach the same reactive state read by
debug overlays inside.

Mount inside `<MujocoPhysics>`, render nothing. Writes to `scene.sim`
directly instead of using `bind:sim={scene.sim}` so the bind: chain doesn't
traverse intermediate ancestors (Tooltip.Provider, MujocoProvider, …) and
trip `ownership_invalid_binding`.
-->
<script lang="ts">
	import { useMujocoContext } from 'mujoco-svelte';
	import type { SceneState } from '$lib/stores/sceneState.svelte.js';

	let { scene }: { scene: SceneState } = $props();

	const current = useMujocoContext();

	$effect(() => {
		scene.sim = current;
	});
</script>
