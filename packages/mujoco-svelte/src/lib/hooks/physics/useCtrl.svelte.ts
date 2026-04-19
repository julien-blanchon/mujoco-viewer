/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMujocoContext } from '../../core/context.js';
import { findActuatorByName } from '../../core/SceneLoader.js';
import type { Actuators, CtrlHandle } from '../../types.js';

/**
 * Access a single actuator's control value by name.
 *
 * Returns a `CtrlHandle` with `read()` / `write()` methods that operate
 * directly on `data.ctrl` without triggering Svelte reactivity.
 */
export function useCtrl(name: Actuators): CtrlHandle {
	const sim = useMujocoContext();
	let actuatorId = -1;
	let range: [number, number] = [0, 0];

	$effect(() => {
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return;
		actuatorId = findActuatorByName(model, name);
		if (actuatorId >= 0) {
			range = [
				model.actuator_ctrlrange[actuatorId * 2],
				model.actuator_ctrlrange[actuatorId * 2 + 1]
			];
		}
	});

	return {
		read() {
			const data = sim.mjData;
			if (!data || actuatorId < 0) return 0;
			return data.ctrl[actuatorId];
		},
		write(value: number) {
			const data = sim.mjData;
			if (!data || actuatorId < 0) return;
			data.ctrl[actuatorId] = value;
		},
		name,
		get range(): [number, number] {
			return range;
		}
	};
}
