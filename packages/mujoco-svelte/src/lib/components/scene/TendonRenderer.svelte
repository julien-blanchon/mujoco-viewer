<!--
@component
TendonRenderer — render tendons as Catmull-Rom tube geometries.

Each tendon geometry is rebuilt per frame to follow wrapping positions.
Tendons with fewer than two wrap points are hidden.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';

	const DEFAULT_TENDON_COLOR = new THREE.Color(0.3, 0.3, 0.8);
	const DEFAULT_TENDON_WIDTH = 0.002;

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.tendon ?? true);

	let group = $state<THREE.Group>();
	let meshes: THREE.Mesh[] = [];
	let curves: THREE.CatmullRomCurve3[] = [];
	let material: THREE.MeshStandardMaterial | null = null;

	$effect(() => {
		if (sim.status !== 'ready') return;
		const model = sim.mjModel;
		const data = sim.mjData;
		const g = group;
		if (!model || !data || !g) return;

		const ntendon = model.ntendon ?? 0;
		// Some mujoco-js builds omit tendon arrays entirely when the model has
		// none (or even when it has some, on older builds). Bail out if the
		// critical arrays aren't there — Phase 0 exposes tendon metadata via
		// `sim.tendons` instead.
		if (ntendon === 0) return;
		const wrapnumArr = model.ten_wrapnum;
		const wrapadrArr = model.ten_wrapadr;
		if (!wrapnumArr || !wrapadrArr) return;

		material = new THREE.MeshStandardMaterial({
			color: DEFAULT_TENDON_COLOR,
			roughness: 0.6,
			metalness: 0.1
		});

		meshes = [];
		curves = [];
		for (let t = 0; t < ntendon; t++) {
			const wrapNum = wrapnumArr[t];
			if (wrapNum < 2) {
				meshes.push(null as unknown as THREE.Mesh);
				curves.push(null as unknown as THREE.CatmullRomCurve3);
				continue;
			}
			const points = Array.from({ length: wrapNum }, () => new THREE.Vector3());
			const curve = new THREE.CatmullRomCurve3(points, false);
			const segments = Math.max(wrapNum * 2, 4);
			const geometry = new THREE.TubeGeometry(curve, segments, DEFAULT_TENDON_WIDTH, 6, false);
			const mesh = new THREE.Mesh(geometry, material);
			mesh.frustumCulled = false;
			g.add(mesh);
			meshes.push(mesh);
			curves.push(curve);
		}

		return () => {
			for (const m of meshes) {
				if (!m) continue;
				g.remove(m);
				m.geometry.dispose();
			}
			material?.dispose();
			meshes = [];
			curves = [];
			material = null;
		};
	});

	useTask(
		(_delta) => {
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return;

			const ntendon = model.ntendon ?? 0;
			const wrapnumArr = model.ten_wrapnum;
			const wrapadrArr = model.ten_wrapadr;
			if (!wrapnumArr || !wrapadrArr) return;
			for (let t = 0; t < ntendon; t++) {
				const mesh = meshes[t];
				const curve = curves[t];
				if (!mesh || !curve) continue;

				const wrapAdr = wrapadrArr[t];
				const wrapNum = wrapnumArr[t];
				let validCount = 0;
				for (let w = 0; w < wrapNum; w++) {
					const idx = (wrapAdr + w) * 3;
					if (data.wrap_xpos && idx + 2 < data.wrap_xpos.length) {
						const x = data.wrap_xpos[idx];
						const y = data.wrap_xpos[idx + 1];
						const z = data.wrap_xpos[idx + 2];
						if (x !== 0 || y !== 0 || z !== 0) {
							if (validCount < curve.points.length) {
								curve.points[validCount].set(x, y, z);
							}
							validCount++;
						}
					}
				}
				if (validCount < 2) {
					mesh.visible = false;
					continue;
				}
				if (curve.points.length !== validCount) {
					curve.points.length = validCount;
					while (curve.points.length < validCount) curve.points.push(new THREE.Vector3());
				}
				mesh.geometry.dispose();
				mesh.geometry = new THREE.TubeGeometry(
					curve,
					Math.max(validCount * 2, 4),
					DEFAULT_TENDON_WIDTH,
					6,
					false
				);
				mesh.visible = true;
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={group} {visible} />
{/if}
