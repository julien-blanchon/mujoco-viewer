/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMujocoContext } from '../../core/context.js';
import { getName } from '../../core/SceneLoader.js';
import type { ActuatorInfo } from '../../types.js';

/**
 * Returns actuator metadata for building control UIs. Recomputed whenever the
 * model identity changes. Reads/writes go directly to `data.ctrl[id]` via
 * `useCtrl` or the API's `setCtrl`.
 */
export function useActuators(): () => ActuatorInfo[] {
	const ctx = useMujocoContext();

	return () => {
		if (ctx.status !== 'ready') return [];
		const model = ctx.mjModel;
		if (!model) return [];
		const actuators: ActuatorInfo[] = [];
		for (let i = 0; i < model.nu; i++) {
			const name = getName(model, model.name_actuatoradr[i]);
			const lo = model.actuator_ctrlrange[i * 2];
			const hi = model.actuator_ctrlrange[i * 2 + 1];
			const hasRange = lo < hi;
			const range: [number, number] = hasRange ? [lo, hi] : [-Infinity, Infinity];
			actuators.push({ id: i, name, range });
		}
		return actuators;
	};
}
