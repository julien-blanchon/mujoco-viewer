<!--
@component
DebugGeoms — wireframe overlay for every `geom` in the MuJoCo model.

Useful for verifying collision shapes vs. visual meshes.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { iterGeoms } from '../../utils/modelIter.js';
	import { readBodyPos, readBodyQuat } from '../../utils/modelAccess.js';

	type Props = {
		/** Show the wireframe overlay. Default: true. */
		visible?: boolean;
	};

	let { visible = true }: Props = $props();

	const _v = new THREE.Vector3();
	const sim = useMujocoContext();

	let root = $state<THREE.Group>();
	let meshes: THREE.Mesh[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const m of meshes) {
			g.remove(m);
			m.geometry.dispose();
		}
		meshes = [];

		for (const gid of iterGeoms(model)) {
			const type = model.geom_type[gid];
			const s = model.geom_size;
			let geometry: THREE.BufferGeometry | null = null;
			switch (type) {
				case 2:
					geometry = new THREE.SphereGeometry(s[3 * gid], 12, 8);
					break;
				case 3:
					geometry = new THREE.CapsuleGeometry(s[3 * gid], s[3 * gid + 1] * 2, 6, 8);
					break;
				case 5:
					geometry = new THREE.CylinderGeometry(s[3 * gid], s[3 * gid], s[3 * gid + 1] * 2, 12);
					break;
				case 6:
					geometry = new THREE.BoxGeometry(s[3 * gid] * 2, s[3 * gid + 1] * 2, s[3 * gid + 2] * 2);
					break;
			}
			if (!geometry) continue;
			const mat = new THREE.MeshBasicMaterial({
				color: 0x00ff00,
				wireframe: true,
				transparent: true,
				opacity: 0.3
			});
			const mesh = new THREE.Mesh(geometry, mat);
			mesh.userData.geomId = gid;
			mesh.userData.bodyId = model.geom_bodyid[gid];
			g.add(mesh);
			meshes.push(mesh);
		}

		return () => {
			for (const m of meshes) {
				g.remove(m);
				m.geometry.dispose();
			}
			meshes = [];
		};
	});

	useTask(
		() => {
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return;
			for (const mesh of meshes) {
				const bid = mesh.userData.bodyId as number;
				const gid = mesh.userData.geomId as number;
				readBodyPos(data, bid, mesh.position);
				readBodyQuat(data, bid, mesh.quaternion);
				const gp = model.geom_pos;
				_v.set(gp[3 * gid], gp[3 * gid + 1], gp[3 * gid + 2]).applyQuaternion(mesh.quaternion);
				mesh.position.add(_v);
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
