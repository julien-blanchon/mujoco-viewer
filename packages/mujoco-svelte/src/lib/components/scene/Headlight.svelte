<!--
@component
Headlight

Camera-attached directional light matching MuJoCo's `<visual><headlight>`.
Reads ambient/diffuse/specular/active from `model.vis.headlight` with graceful
fallbacks for mujoco-js builds that don't expose the nested struct.

Drop inside a `<Canvas>` (or `<MujocoCanvas>`) tree. Renders nothing if the
model is not ready or headlight is disabled.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask, useThrelte } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';

	type Props = {
		/**
		 * Multiplier applied to diffuse intensity. MuJoCo stores headlight RGB in
		 * `[0, 1]`; this slider lets consumers brighten/dim without re-compiling.
		 */
		intensity?: number;
		/** Override active flag regardless of `model.vis.headlight.active`. */
		active?: boolean;
		/** Cast shadows. Honors `VisualOptions.render.shadow` when a provider is mounted. */
		castShadow?: boolean;
	};

	let { intensity = 1, active, castShadow }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const { camera } = useThrelte();

	const headlight = $derived(sim.mjModel?.vis?.headlight ?? null);
	const isActive = $derived.by(() => {
		if (active !== undefined) return active;
		if (!headlight) return sim.status === 'ready';
		return (headlight.active ?? 1) !== 0;
	});
	const ambientColor = $derived.by(() => {
		const a = headlight?.ambient;
		return a && a.length >= 3 ? new THREE.Color(a[0], a[1], a[2]) : new THREE.Color(0.25, 0.25, 0.3);
	});
	const diffuseColor = $derived.by(() => {
		const d = headlight?.diffuse;
		return d && d.length >= 3 ? new THREE.Color(d[0], d[1], d[2]) : new THREE.Color(1, 1, 1);
	});
	const effectiveShadow = $derived.by(() => {
		if (castShadow !== undefined) return castShadow;
		return visualOptions?.render.shadow ?? true;
	});

	let light = $state<THREE.DirectionalLight>();
	const _v = new THREE.Vector3();
	const _dir = new THREE.Vector3();

	// Track the camera so the headlight points where the viewer is looking.
	useTask(() => {
		const l = light;
		const cam = camera.current;
		if (!l || !cam) return;
		cam.getWorldPosition(_v);
		cam.getWorldDirection(_dir);
		// Place light slightly behind & above the camera so we don't get a flat
		// view-aligned normal look on everything.
		l.position.copy(_v).addScaledVector(_dir.clone().multiplyScalar(-1), 0.5).add(new THREE.Vector3(0, 0, 0.5));
		l.target.position.copy(_v).add(_dir);
		l.target.updateMatrixWorld();
	});
</script>

{#if sim.status === 'ready' && isActive}
	<T.AmbientLight color={ambientColor} intensity={1} />
	<T.DirectionalLight
		bind:ref={light}
		color={diffuseColor}
		intensity={intensity}
		castShadow={effectiveShadow}
	/>
{/if}
