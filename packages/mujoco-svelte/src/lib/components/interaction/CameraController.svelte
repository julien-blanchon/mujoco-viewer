<!--
@component
CameraController — switches the active camera between Free / Fixed / Tracking.

Modes:
  - `'free'`          : do nothing; leave the user's OrbitControls in charge.
  - `{ kind: 'fixed', id }`    : drive camera position + quaternion from `data.cam_xpos[id]` / `cam_xmat[id]` every frame.
  - `{ kind: 'track', bodyId }`: keep the camera's orbit target locked to the body's world position. Caller still uses OrbitControls for orbiting around the moving target.

When a fixed camera is active, OrbitControls should be disabled by the caller
— the component can't know which controls instance is wired up. Bind the
`shouldOrbit` prop out to drive that toggle.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { useTask, useThrelte } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';

	export type CameraMode =
		| 'free'
		| { kind: 'fixed'; id: number }
		| { kind: 'track'; bodyId: number };

	type Props = {
		mode: CameraMode;
		/**
		 * Bound out — `true` when the mode is 'free' (OrbitControls should be on)
		 * or 'track' (OrbitControls stays on so user can orbit the moving target),
		 * `false` when a fixed named camera is driving.
		 */
		shouldOrbit?: boolean;
		/** Optional callback invoked when a fixed camera drives pose — useful for
		 *  updating the OrbitControls target to match. */
		onFixedPose?: (pos: THREE.Vector3, quat: THREE.Quaternion) => void;
	};

	let {
		mode,
		shouldOrbit = $bindable(true),
		onFixedPose
	}: Props = $props();

	const sim = useMujocoContext();
	const { camera } = useThrelte();

	// Externalise the "should the user-provided OrbitControls be active?" flag
	// so consumers can bind it to their OrbitControls' `enabled` prop.
	$effect(() => {
		if (mode === 'free' || (typeof mode === 'object' && mode.kind === 'track')) {
			shouldOrbit = true;
		} else {
			shouldOrbit = false;
		}
	});

	const _mat = new THREE.Matrix4();
	const _pos = new THREE.Vector3();
	const _quat = new THREE.Quaternion();

	useTask(
		() => {
			if (mode === 'free') return;
			const data = sim.mjData;
			const model = sim.mjModel;
			const cam = camera.current;
			if (!data || !model || !cam) return;

			if (mode.kind === 'fixed') {
				const id = mode.id;
				if (id < 0 || id >= (model.ncam ?? 0)) return;
				const xp = data.cam_xpos;
				const xm = data.cam_xmat;
				if (!xp || !xm) return;
				_pos.set(xp[id * 3], xp[id * 3 + 1], xp[id * 3 + 2]);
				const off = id * 9;
				_mat.set(
					xm[off], xm[off + 1], xm[off + 2], 0,
					xm[off + 3], xm[off + 4], xm[off + 5], 0,
					xm[off + 6], xm[off + 7], xm[off + 8], 0,
					0, 0, 0, 1
				);
				_quat.setFromRotationMatrix(_mat);
				cam.position.copy(_pos);
				cam.quaternion.copy(_quat);
				onFixedPose?.(_pos, _quat);
				return;
			}

			if (mode.kind === 'track') {
				// Caller's OrbitControls handles orbit; we just update target.
				// Emit via onFixedPose with identity quat so consumer can push the
				// body position into `controls.target`.
				const bid = mode.bodyId;
				if (bid <= 0 || bid >= model.nbody) return;
				_pos.set(data.xpos[bid * 3], data.xpos[bid * 3 + 1], data.xpos[bid * 3 + 2]);
				_quat.identity();
				onFixedPose?.(_pos, _quat);
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>
