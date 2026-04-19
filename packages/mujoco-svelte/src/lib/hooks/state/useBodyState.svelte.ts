/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { useMujocoContext } from '../../core/context.js';
import { useAfterPhysicsStep } from '../../core/physicsStep.svelte.js';
import { findBodyByName } from '../../core/SceneLoader.js';
import type { Bodies, BodyStateHandle } from '../../types.js';

/**
 * Track a MuJoCo body's world position, quaternion, and velocities.
 *
 * The returned THREE objects are mutated in place each physics frame — reading
 * them inside an `$effect` or Threlte task gives you live values without
 * extra allocations.
 */
export function useBodyState(name: Bodies): BodyStateHandle {
	const sim = useMujocoContext();
	let bodyId = -1;
	const position = new THREE.Vector3();
	const quaternion = new THREE.Quaternion();
	const linearVelocity = new THREE.Vector3();
	const angularVelocity = new THREE.Vector3();

	$effect(() => {
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return;
		bodyId = findBodyByName(model, name);
	});

	useAfterPhysicsStep((_model, data) => {
		if (bodyId < 0) return;
		const i3 = bodyId * 3;
		position.set(data.xpos[i3], data.xpos[i3 + 1], data.xpos[i3 + 2]);
		const i4 = bodyId * 4;
		quaternion.set(
			data.xquat[i4 + 1],
			data.xquat[i4 + 2],
			data.xquat[i4 + 3],
			data.xquat[i4]
		);
		if (data.cvel) {
			const i6 = bodyId * 6;
			angularVelocity.set(data.cvel[i6], data.cvel[i6 + 1], data.cvel[i6 + 2]);
			linearVelocity.set(data.cvel[i6 + 3], data.cvel[i6 + 4], data.cvel[i6 + 5]);
		}
	});

	return {
		get position() {
			return position;
		},
		get quaternion() {
			return quaternion;
		},
		get linearVelocity() {
			return linearVelocity;
		},
		get angularVelocity() {
			return angularVelocity;
		}
	};
}
