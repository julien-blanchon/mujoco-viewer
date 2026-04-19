<!--
@component
MujocoCanvas — Threlte `<Canvas>` wrapped around a `<MujocoPhysics>`.

Must be placed inside a `<MujocoProvider>`. Renders nothing while WASM is
still loading or in an error state, matching the React version.

```svelte
<MujocoProvider>
    <MujocoCanvas
        config={...}
        camera={{ position: [2, -1.5, 2.5], fov: 45 }}
        bind:api
    >
        <OrbitControls />
    </MujocoCanvas>
</MujocoProvider>
```

Convention: MuJoCo is z-up, so the camera's `up` vector defaults to
`[0, 0, 1]`. Set it explicitly via the `camera.up` prop if needed.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { Canvas, T } from '@threlte/core';
	import { useMujocoWasm } from '../context.js';
	import MujocoPhysics from './MujocoPhysics.svelte';
	import type { MujocoCanvasProps } from '../../types.js';

	let {
		config,
		onReady,
		onError,
		onStep,
		onSelection,
		gravity,
		timestep,
		substeps,
		paused = $bindable(false),
		speed = $bindable(1),
		selectedBodyId = $bindable<number | null>(null),
		camera,
		shadows = true,
		class: className,
		style,
		api = $bindable(null),
		children
	}: MujocoCanvasProps = $props();

	const wasm = useMujocoWasm();

	$effect(() => {
		if (wasm.status === 'error' && onError) {
			onError(new Error(wasm.error ?? 'WASM load failed'));
		}
	});

	const position = $derived<[number, number, number]>(camera?.position ?? [3, 3, 3]);
	const up = $derived<[number, number, number]>(camera?.up ?? [0, 0, 1]);
	const fov = $derived(camera?.fov ?? 45);
	const near = $derived(camera?.near ?? 0.01);
	const far = $derived(camera?.far ?? 100);
</script>

<div class={className} style={style ?? 'width: 100%; height: 100%;'}>
	{#if wasm.status === 'ready' && wasm.mujoco}
		<Canvas {shadows} renderMode="always">
			<T.PerspectiveCamera
				makeDefault
				{position}
				{fov}
				{near}
				{far}
				oncreate={(cam) => {
					const pc = cam as THREE.PerspectiveCamera;
					pc.up.set(up[0], up[1], up[2]);
					pc.lookAt(new THREE.Vector3(0, 0, 0));
					pc.updateProjectionMatrix();
				}}
			/>
			<MujocoPhysics
				{config}
				{onReady}
				{onError}
				{onStep}
				{onSelection}
				{gravity}
				{timestep}
				{substeps}
				bind:paused
				bind:speed
				bind:selectedBodyId
				bind:api
			>
				{@render children?.()}
			</MujocoPhysics>
		</Canvas>
	{/if}
</div>
