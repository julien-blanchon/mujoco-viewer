/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useGamepad — gamepad teleoperation hook (spec 12.2)
 */

import { useMujocoContext } from '../../core/context.js';
import { useBeforePhysicsStep } from '../../core/physicsStep.svelte.js';
import { findActuatorByName } from '../../core/SceneLoader.js';

export interface GamepadOptions {
	/** Map gamepad axis index to actuator name. */
	axes?: Record<number, string>;
	/** Map gamepad button index to actuator name. */
	buttons?: Record<number, string>;
	/** Axis deadzone. Default: 0.1. */
	deadzone?: number;
	/** Scale factor for axis values. Default: 1.0. */
	scale?: number;
	/** Gamepad index. Default: 0 (first connected). */
	gamepadIndex?: number;
	enabled?: boolean;
}

/**
 * Map gamepad axes and buttons to actuator controls.
 * Axes map their -1..1 value (scaled) to the actuator.
 * Buttons map their 0..1 pressed value to the actuator.
 *
 * Pass `options` as a getter so prop/state changes flow through reactively.
 */
export function useGamepad(getOptions: () => GamepadOptions): void {
	const sim = useMujocoContext();
	const axisCache = new Map<number, number>();
	const buttonCache = new Map<number, number>();

	// Re-resolve actuator ids when the model loads or bindings change.
	$effect(() => {
		const opts = getOptions();
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return;
		axisCache.clear();
		buttonCache.clear();
		for (const [idx, name] of Object.entries(opts.axes ?? {})) {
			axisCache.set(Number(idx), findActuatorByName(model, name));
		}
		for (const [idx, name] of Object.entries(opts.buttons ?? {})) {
			buttonCache.set(Number(idx), findActuatorByName(model, name));
		}
	});

	useBeforePhysicsStep((_model, data) => {
		const opts = getOptions();
		if (opts.enabled === false) return;

		if (typeof navigator === 'undefined') return;
		const gamepads = navigator.getGamepads?.();
		if (!gamepads) return;
		const gp = gamepads[opts.gamepadIndex ?? 0];
		if (!gp) return;

		const deadzone = opts.deadzone ?? 0.1;
		const scale = opts.scale ?? 1.0;

		for (const [axisIdx, actId] of axisCache) {
			if (actId < 0 || axisIdx >= gp.axes.length) continue;
			let val = gp.axes[axisIdx];
			if (Math.abs(val) < deadzone) val = 0;
			data.ctrl[actId] = val * scale;
		}

		for (const [btnIdx, actId] of buttonCache) {
			if (actId < 0 || btnIdx >= gp.buttons.length) continue;
			data.ctrl[actId] = gp.buttons[btnIdx].value;
		}
	});
}
