<!--
@component
PanelStack — the 3 floating panels (Scene tree / Inspector / Controls).
-->
<script lang="ts">
	import type { MujocoSimState, VisualOptions } from 'mujoco-svelte';
	import * as FloatingPanel from '$lib/components/ui/floating-panel/index.js';
	import SceneTree from '$lib/panels/SceneTree.svelte';
	import Inspector from '$lib/panels/Inspector.svelte';
	import VisualOptionsPanel from '$lib/panels/VisualOptionsPanel.svelte';
	import SimControlsPanel from '$lib/panels/SimControlsPanel.svelte';
	import type { SceneState } from '$lib/stores/sceneState.svelte.js';
	import type { CameraController } from '$lib/stores/cameraController.svelte.js';
	import type { PanelLayout } from '$lib/stores/panelLayout.svelte.js';

	type Props = {
		scene: SceneState;
		camera: CameraController;
		layout: PanelLayout;
		visualOptions: VisualOptions;
	};

	let { scene, camera, layout, visualOptions }: Props = $props();

	const sim: MujocoSimState | null = $derived(scene.sim);
</script>

<FloatingPanel.Root
	position="top-left"
	bind:collapsed={layout.tree.collapsed}
	width={layout.widths.tree}
	maxHeight="calc(100vh - 80px)"
	minHeight="220px"
>
	<FloatingPanel.Header title="Scene tree" />
	<FloatingPanel.Body>
		<SceneTree {sim} {camera} />
	</FloatingPanel.Body>
</FloatingPanel.Root>

<FloatingPanel.Root
	position="top-right"
	bind:collapsed={layout.inspector.collapsed}
	bind:open={layout.inspector.open}
	width={layout.widths.inspector}
	maxHeight="calc(55vh - 32px)"
	closable
>
	<FloatingPanel.Header title="Inspector" />
	<FloatingPanel.Body>
		<Inspector
			{sim}
			onUseCamera={(id) => (camera.mode = { kind: 'fixed', id })}
		/>
	</FloatingPanel.Body>
</FloatingPanel.Root>

<FloatingPanel.Root
	position="bottom-right"
	bind:collapsed={layout.controls.collapsed}
	width={layout.widths.controls}
	maxHeight="calc(38vh - 32px)"
>
	<FloatingPanel.Header title="Controls" />
	<FloatingPanel.Body>
		<SimControlsPanel {sim} />
		<VisualOptionsPanel options={visualOptions} />
	</FloatingPanel.Body>
</FloatingPanel.Root>
