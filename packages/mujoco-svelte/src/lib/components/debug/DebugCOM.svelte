<!--
@component
DebugCOM — red sphere marker at every body's center of mass.

Skips the world body (id 0).
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { makeOverlayObject } from '../../utils/overlay.js';
	import { iterBodies } from '../../utils/modelIter.js';
	import { readBodyCom } from '../../utils/modelAccess.js';

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.com ?? true);
	const radius = $derived(visualOptions?.scale.com ?? 0.02);

	let root = $state<THREE.Group>();
	let markers: THREE.Mesh[] = [];

	$effect(() => {
		void sim.status;
		void radius;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const m of markers) {
			g.remove(m);
			m.geometry.dispose();
		}
		markers = [];

		for (const bid of iterBodies(model)) {
			const geometry = new THREE.SphereGeometry(radius, 8, 6);
			const mat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
			const mesh = makeOverlayObject(new THREE.Mesh(geometry, mat), {
				renderOrder: 999,
				transparent: false
			});
			mesh.userData.bodyId = bid;
			g.add(mesh);
			markers.push(mesh);
		}

		return () => {
			for (const m of markers) {
				g.remove(m);
				m.geometry.dispose();
			}
			markers = [];
		};
	});

	useTask(
		() => {
			const data = sim.mjData;
			if (!data) return;
			for (const mesh of markers) {
				const bid = mesh.userData.bodyId as number;
				// `readBodyCom` picks `xipos` when available, falls back to `xpos`.
				readBodyCom(data, bid, mesh.position);
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
