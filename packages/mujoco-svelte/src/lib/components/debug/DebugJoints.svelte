<!--
@component
DebugJoints — colored arrows showing each joint's position and axis.

Colors: red=free, green=ball, blue=slide, yellow=hinge.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { makeOverlayObject } from '../../utils/overlay.js';
	import { iterJoints } from '../../utils/modelIter.js';
	import { readJointAnchor, readJointAxis, maxBodyGeomSize } from '../../utils/modelAccess.js';

	const JOINT_COLORS: Record<number, number> = {
		0: 0xff0000,
		1: 0x00ff00,
		2: 0x0000ff,
		3: 0xffff00
	};

	const _v = new THREE.Vector3();
	const _q = new THREE.Quaternion();
	const _scratch = new THREE.Vector3();
	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.joint ?? true);

	let root = $state<THREE.Group>();
	let arrows: THREE.ArrowHelper[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const a of arrows) g.remove(a);
		arrows = [];

		for (const jid of iterJoints(model)) {
			const type = model.jnt_type[jid];
			const color = JOINT_COLORS[type] ?? 0xffffff;
			const bodyId = model.jnt_bodyid[jid];
			const arrowLen = Math.max(maxBodyGeomSize(model, bodyId) * 0.8, 0.05);
			const arrow = new THREE.ArrowHelper(
				new THREE.Vector3(0, 0, 1),
				new THREE.Vector3(),
				arrowLen,
				color,
				arrowLen * 0.25,
				arrowLen * 0.12
			);
			arrow.line.material = new THREE.LineBasicMaterial({ color });
			makeOverlayObject(arrow, { renderOrder: 999, transparent: false });
			arrow.userData.jointId = jid;
			arrow.userData.bodyId = bodyId;
			g.add(arrow);
			arrows.push(arrow);
		}

		return () => {
			for (const a of arrows) g.remove(a);
			arrows = [];
		};
	});

	useTask(
		() => {
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return;

			for (const arrow of arrows) {
				const jid = arrow.userData.jointId as number;
				readJointAnchor(model, data, jid, arrow.position, _q, _scratch);
				if (readJointAxis(model, data, jid, _v, _q)) {
					arrow.setDirection(_v);
				}
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
