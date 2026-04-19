<!--
@component
FlexRenderer — render MuJoCo flex (deformable) bodies.

Vertices are updated every frame from `data.flexvert_xpos`. The face arrays
are not exposed by mujoco-js 0.0.7, so meshes render as point clouds.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';

	const sim = useMujocoContext();
	let group = $state<THREE.Group>();
	let meshes: THREE.Mesh[] = [];

	$effect(() => {
		if (sim.status !== 'ready') return;
		const model = sim.mjModel;
		const g = group;
		if (!model || !g) return;

		const nflex = model.nflex ?? 0;
		if (nflex === 0) return;

		for (let f = 0; f < nflex; f++) {
			const vertAdr = model.flex_vertadr[f];
			const vertNum = model.flex_vertnum[f];
			if (vertNum === 0) continue;

			const geometry = new THREE.BufferGeometry();
			const positions = new Float32Array(vertNum * 3);
			geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geometry.computeVertexNormals();

			let color = new THREE.Color(0.5, 0.5, 0.5);
			if (model.flex_rgba) {
				color = new THREE.Color(
					model.flex_rgba[4 * f],
					model.flex_rgba[4 * f + 1],
					model.flex_rgba[4 * f + 2]
				);
			}
			const material = new THREE.MeshStandardMaterial({
				color,
				roughness: 0.7,
				side: THREE.DoubleSide
			});
			const mesh = new THREE.Mesh(geometry, material);
			mesh.userData.flexId = f;
			mesh.userData.vertAdr = vertAdr;
			mesh.userData.vertNum = vertNum;
			g.add(mesh);
			meshes.push(mesh);
		}

		return () => {
			for (const m of meshes) {
				g.remove(m);
				m.geometry.dispose();
				(m.material as THREE.Material).dispose();
			}
			meshes = [];
		};
	});

	useTask(
		(_delta) => {
			const data = sim.mjData;
			if (!data || !data.flexvert_xpos) return;
			for (const m of meshes) {
				const vertAdr = m.userData.vertAdr as number;
				const vertNum = m.userData.vertNum as number;
				const posAttr = m.geometry.getAttribute('position') as THREE.BufferAttribute;
				if (!posAttr) continue;
				for (let v = 0; v < vertNum; v++) {
					const srcIdx = (vertAdr + v) * 3;
					posAttr.setXYZ(
						v,
						data.flexvert_xpos[srcIdx],
						data.flexvert_xpos[srcIdx + 1],
						data.flexvert_xpos[srcIdx + 2]
					);
				}
				posAttr.needsUpdate = true;
				m.geometry.computeVertexNormals();
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={group} />
{/if}
