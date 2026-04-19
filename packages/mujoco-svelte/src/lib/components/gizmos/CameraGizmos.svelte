<!--
@component
CameraGizmos — wireframe frustum per MuJoCo named camera so the user can see
where each cam is pointing. Honors `VisualOptions.vis.camera`.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { iterCameras } from '../../utils/modelIter.js';
	import { readCameraMatrix } from '../../utils/modelAccess.js';

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.camera ?? false);

	let root = $state<THREE.Group>();
	let gizmos: THREE.CameraHelper[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const gz of gizmos) g.remove(gz);
		gizmos = [];

		for (const cid of iterCameras(model)) {
			const fovy = model.cam_fovy?.[cid] ?? 45;
			const cam = new THREE.PerspectiveCamera(fovy, 4 / 3, 0.05, 0.5);
			const helper = new THREE.CameraHelper(cam);
			helper.userData.camId = cid;
			helper.userData.helperCamera = cam;
			helper.frustumCulled = false;
			g.add(helper);
			gizmos.push(helper);
		}

		return () => {
			for (const gz of gizmos) g.remove(gz);
			gizmos = [];
		};
	});

	const _mat = new THREE.Matrix4();

	useTask(
		() => {
			if (sim.status !== 'ready') return;
			const data = sim.mjData;
			if (!data) return;
			try {
				for (const helper of gizmos) {
					const id = helper.userData.camId as number;
					const cam = helper.userData.helperCamera as THREE.PerspectiveCamera;
					if (readCameraMatrix(data, id, _mat)) {
						cam.position.setFromMatrixPosition(_mat);
						cam.quaternion.setFromRotationMatrix(_mat);
					}
					cam.updateMatrixWorld(true);
					helper.update();
				}
			} catch {
				/* freed mid-frame */
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
