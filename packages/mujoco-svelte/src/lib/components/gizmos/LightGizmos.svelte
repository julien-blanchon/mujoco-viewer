<!--
@component
LightGizmos — renders a small glyph per MuJoCo light so users can see where
the scene lighting lives. Directional lights get an arrow along `light_dir`;
spot lights get a cone pointing the same way; point lights a sphere.

Honors `VisualOptions.vis.light`.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { makeOverlayObject } from '../../utils/overlay.js';
	import { iterLights } from '../../utils/modelIter.js';

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.light ?? false);

	type Glyph = { group: THREE.Group; lightId: number };
	let root = $state<THREE.Group>();
	let glyphs: Glyph[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const { group } of glyphs) g.remove(group);
		glyphs = [];

		for (const lid of iterLights(model)) {
			const type = model.light_type?.[lid] ?? 1;
			const group = new THREE.Group();
			const color = new THREE.Color(
				model.light_diffuse?.[3 * lid] ?? 1,
				model.light_diffuse?.[3 * lid + 1] ?? 1,
				model.light_diffuse?.[3 * lid + 2] ?? 1
			);
			const mat = new THREE.MeshBasicMaterial({ color, wireframe: true });

			if (type === 1) {
				// Directional — arrow of length 0.2
				const arrow = new THREE.ArrowHelper(
					new THREE.Vector3(0, 0, 1),
					new THREE.Vector3(),
					0.2,
					color,
					0.05,
					0.03
				);
				group.add(arrow);
			} else if (type === 0) {
				// Spot — cone along +Z
				const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 16), mat);
				cone.rotation.x = Math.PI;
				group.add(cone);
			} else {
				// Point — sphere
				const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat);
				group.add(sphere);
			}

			makeOverlayObject(group, { renderOrder: 999, transparent: false });
			group.userData.lightId = lid;
			g.add(group);
			glyphs.push({ group, lightId: lid });
		}

		return () => {
			for (const { group } of glyphs) g.remove(group);
			glyphs = [];
		};
	});

	const _dir = new THREE.Vector3();

	useTask(
		() => {
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return;
			for (const { group, lightId } of glyphs) {
				const i3 = lightId * 3;
				const pos = model.light_pos;
				const dir = model.light_dir;
				if (pos) group.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
				if (dir) {
					_dir.set(dir[i3], dir[i3 + 1], dir[i3 + 2]);
					if (_dir.lengthSq() > 0) {
						_dir.normalize();
						const up = Math.abs(_dir.z) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
						group.quaternion.setFromRotationMatrix(
							new THREE.Matrix4().lookAt(new THREE.Vector3(), _dir, up)
						);
					}
				}
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
