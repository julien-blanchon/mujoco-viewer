/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMujocoContext } from '../../core/context.js';
import { useBeforePhysicsStep } from '../../core/physicsStep.svelte.js';
import { findActuatorByName } from '../../core/SceneLoader.js';
import type { KeyboardTeleopOptions } from '../../types.js';

/**
 * Map keyboard keys to actuator commands.
 *
 * Supports three binding modes:
 * - `delta` — Add delta to actuator value while key is held
 * - `toggle` — Toggle between two values on key press
 * - `set` — Set actuator to a fixed value while key is held
 *
 * Pass `options` as a getter so prop/state changes flow through reactively.
 */
export function useKeyboardTeleop(getOptions: () => KeyboardTeleopOptions): void {
	const sim = useMujocoContext();
	const pressed = new Set<string>();
	const toggleState = new Map<string, boolean>();
	const actuatorCache = new Map<string, number>();

	// Re-resolve actuator ids when bindings or the model change.
	$effect(() => {
		const opts = getOptions();
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') return;
		actuatorCache.clear();
		for (const binding of Object.values(opts.bindings)) {
			if (!actuatorCache.has(binding.actuator)) {
				actuatorCache.set(binding.actuator, findActuatorByName(model, binding.actuator));
			}
		}
		// Clear stale key state when bindings change.
		const validKeys = new Set(Object.keys(opts.bindings));
		for (const k of pressed) if (!validKeys.has(k)) pressed.delete(k);
		for (const k of toggleState.keys()) if (!validKeys.has(k)) toggleState.delete(k);
	});

	$effect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const opts = getOptions();
			if (opts.enabled === false) return;
			const key = e.key.toLowerCase();
			const binding = opts.bindings[key];
			if (!binding) return;
			pressed.add(key);
			if (binding.toggle) {
				toggleState.set(key, !(toggleState.get(key) ?? false));
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			pressed.delete(e.key.toLowerCase());
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	});

	useBeforePhysicsStep((_model, data) => {
		const opts = getOptions();
		if (opts.enabled === false) return;
		for (const [key, binding] of Object.entries(opts.bindings)) {
			const actId = actuatorCache.get(binding.actuator);
			if (actId === undefined || actId < 0) continue;
			if (binding.toggle) {
				const state = toggleState.get(key) ?? false;
				data.ctrl[actId] = state ? binding.toggle[1] : binding.toggle[0];
			} else if (pressed.has(key)) {
				if (binding.delta !== undefined) data.ctrl[actId] += binding.delta;
				else if (binding.set !== undefined) data.ctrl[actId] = binding.set;
			}
		}
	});
}
