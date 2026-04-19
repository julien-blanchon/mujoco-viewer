/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMujocoContext } from '../../core/context.js';
import { useAfterPhysicsStep } from '../../core/physicsStep.svelte.js';
import { getName } from '../../core/SceneLoader.js';
import type { Joints, JointStateHandle } from '../../types.js';

/**
 * Track a MuJoCo joint's position and velocity by name.
 *
 * For hinge/slide joints, both values are scalar numbers. For ball joints the
 * position is a 4-element Float64Array (quaternion, MuJoCo w,x,y,z order) and
 * the velocity is a 3-element Float64Array. Free joints return 7/6.
 */
export function useJointState(name: Joints): JointStateHandle {
	const sim = useMujocoContext();
	let jointId = -1;
	let qposAdr = 0;
	let dofAdr = 0;
	let qposDim = 1;
	let dofDim = 1;
	let position: number | Float64Array = 0;
	let velocity: number | Float64Array = 0;
	let posBuffer: Float64Array | null = null;
	let velBuffer: Float64Array | null = null;

	$effect(() => {
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return;
		jointId = -1;
		for (let i = 0; i < model.njnt; i++) {
			if (getName(model, model.name_jntadr[i]) !== name) continue;
			jointId = i;
			qposAdr = model.jnt_qposadr[i];
			dofAdr = model.jnt_dofadr[i];
			const type = model.jnt_type[i];
			if (type === 0) {
				qposDim = 7;
				dofDim = 6;
			} else if (type === 1) {
				qposDim = 4;
				dofDim = 3;
			} else {
				qposDim = 1;
				dofDim = 1;
			}
			if (qposDim > 1) {
				posBuffer = new Float64Array(qposDim);
				velBuffer = new Float64Array(dofDim);
			} else {
				posBuffer = null;
				velBuffer = null;
			}
			return;
		}
	});

	useAfterPhysicsStep((_model, data) => {
		if (jointId < 0) return;
		if (qposDim === 1) {
			position = data.qpos[qposAdr];
			velocity = data.qvel[dofAdr];
		} else {
			posBuffer!.set(data.qpos.subarray(qposAdr, qposAdr + qposDim));
			velBuffer!.set(data.qvel.subarray(dofAdr, dofAdr + dofDim));
			position = posBuffer!;
			velocity = velBuffer!;
		}
	});

	return {
		get position() {
			return position;
		},
		get velocity() {
			return velocity;
		}
	};
}
