<!--
@component
SceneStage — the viewport stack: Threlte `<Canvas>`, interactivity, physics,
debug overlays, selection highlights, camera, lights, grid.
-->
<script lang="ts">
	import { Canvas, T } from '@threlte/core';
	import { Gizmo, OrbitControls } from '@threlte/extras';
	import DefaultFloor from './DefaultFloor.svelte';
	import DefaultSkybox from './DefaultSkybox.svelte';
	import {
		CameraController as CameraControllerComponent,
		CameraGizmos,
		ContactMarkers,
		ContactForces,
		DebugCOM,
		DebugJoints,
		DragInteraction,
		FrameAxes,
		GeomHoverOverlay,
		Headlight,
		InertiaBoxes,
		LightGizmos,
		MujocoProvider,
		MujocoPhysics,
		PerturbArrows,
		provideVisualOptions,
		RenderEffects,
		SelectionMarker,
		SelectionRepresentation,
		TendonRenderer,
		type VisualOptions,
		WorldInteractivity
	} from 'mujoco-svelte';

	import WhenReady from '$lib/WhenReady.svelte';
	import LoadingOverlay from '$lib/LoadingOverlay.svelte';
	import HoverTag from '$lib/HoverTag.svelte';
	import SimBridge from '$lib/panels/SimBridge.svelte';
	import SceneStats from '$lib/SceneStats.svelte';
	import AutoFrame from '$lib/AutoFrame.svelte';
	import type { SceneState } from '$lib/stores/sceneState.svelte.js';
	import type { CameraController as CameraControllerStore } from '$lib/stores/cameraController.svelte.js';

	type Props = {
		scene: SceneState;
		camera: CameraControllerStore;
		visualOptions: VisualOptions;
	};

	let { scene, camera, visualOptions }: Props = $props();

	// Provide VisualOptions to children of the Canvas — set up once here so
	// panels outside the Canvas can still read it via the same context key.
	// svelte-ignore state_referenced_locally
	provideVisualOptions(visualOptions);
</script>

{#key scene.mountKey}
	{#if scene.config}
		<MujocoProvider>
			<WhenReady>
				{#snippet loading()}
					<LoadingOverlay status="loading" loadProgress="Loading MuJoCo WASM…" error={null} />
				{/snippet}
				{#snippet error(message)}
					<LoadingOverlay status="error" loadProgress={null} error={message} />
				{/snippet}

				<Canvas shadows={true} renderMode="always">
					<WorldInteractivity
						onpointermissed={() => {
							if (scene.sim) scene.sim.selection = null;
						}}
					>
						<T.PerspectiveCamera
							bind:ref={camera.camera}
							makeDefault
							position={[3, -3, 2]}
							fov={45}
							near={0.01}
							far={1000}
							up={[0, 0, 1]}
						/>
						<OrbitControls
							bind:ref={camera.orbit}
							enabled={camera.orbitEnabled}
							enableDamping={true}
							dampingFactor={0.1}
							target={[0, 0, 1]}
						>
							<!-- Static bottom-left corner. Use `<Gizmo>`'s placement/offset
							     strictly, never tie it to panel state so it reads as a fixed
							     viewport widget. -->
							<Gizmo placement="bottom-left" size={80} offset={{ left: 16, bottom: 16 }} />
						</OrbitControls>

						<MujocoPhysics config={scene.config} bind:paused={scene.paused}>
							<SimBridge {scene} />
							<AutoFrame onFrame={(info) => camera.frame(info)} />
							<SceneStats {scene} />
							<DefaultSkybox />
							<DefaultFloor />
							<Headlight intensity={1} />
							<DebugJoints />
							<DebugCOM />
							<TendonRenderer />
							<FrameAxes />
							<ContactMarkers />
							<ContactForces />
							<InertiaBoxes />
							<PerturbArrows />
							<LightGizmos />
							<CameraGizmos />
							<GeomHoverOverlay />
							<SelectionMarker />
							<SelectionRepresentation />
							<CameraControllerComponent
								mode={camera.mode}
								bind:shouldOrbit={camera.orbitEnabled}
								onFixedPose={(pos) => camera.handleFixedPose(pos)}
							/>
							<DragInteraction />
							<RenderEffects />
						</MujocoPhysics>

						<T.AmbientLight intensity={0.3} />
						<T.DirectionalLight position={[4, -4, 10]} intensity={0.6} castShadow={true} />
						<T.DirectionalLight position={[-2, 2, 5]} intensity={0.2} />
					</WorldInteractivity>
				</Canvas>

				<LoadingOverlay
					status={scene.status}
					loadProgress={scene.loadProgress}
					error={scene.sceneError}
				/>
				<HoverTag sim={scene.sim} />
			</WhenReady>
		</MujocoProvider>
	{/if}
{/key}
