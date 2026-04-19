/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMujocoContext } from '../../core/context.js';
import { useAfterPhysicsStep } from '../../core/physicsStep.svelte.js';
import { getName } from '../../core/SceneLoader.js';
import { SENSOR_TYPE_NAMES } from '../../core/constants.js';
import type { Sensors, SensorHandle, SensorInfo } from '../../types.js';

/**
 * Access a single MuJoCo sensor by name. The Float64Array returned by
 * `read()` is updated in-place after each physics step.
 */
export function useSensor(name: Sensors): SensorHandle {
	const sim = useMujocoContext();
	let sensorId = -1;
	let sensorAdr = 0;
	let sensorDim = 0;
	let value = new Float64Array(0);

	$effect(() => {
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return;
		sensorId = -1;
		for (let i = 0; i < model.nsensor; i++) {
			if (getName(model, model.name_sensoradr[i]) === name) {
				sensorId = i;
				sensorAdr = model.sensor_adr[i];
				sensorDim = model.sensor_dim[i];
				value = new Float64Array(sensorDim);
				return;
			}
		}
	});

	useAfterPhysicsStep((_model, data) => {
		if (sensorId < 0) return;
		for (let i = 0; i < sensorDim; i++) value[i] = data.sensordata[sensorAdr + i];
	});

	return {
		read() {
			return value;
		},
		get dim() {
			return sensorDim;
		},
		name
	};
}

/**
 * Enumerate all sensors in the loaded MuJoCo model.
 * Returns a function; call it inside a derived for reactivity.
 */
export function useSensors(): () => SensorInfo[] {
	const sim = useMujocoContext();
	return () => {
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return [];
		const result: SensorInfo[] = [];
		for (let i = 0; i < model.nsensor; i++) {
			const type = model.sensor_type[i];
			result.push({
				id: i,
				name: getName(model, model.name_sensoradr[i]),
				type,
				typeName: SENSOR_TYPE_NAMES[type] ?? `unknown(${type})`,
				dim: model.sensor_dim[i],
				adr: model.sensor_adr[i]
			});
		}
		return result;
	};
}
