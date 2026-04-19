/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * usePolicy — policy decimation loop hook (spec 10.1)
 */

import { useBeforePhysicsStep } from '../../core/physicsStep.svelte.js';
import type { PolicyOptions } from '../../types.js';

export interface PolicyHandle {
	readonly isRunning: boolean;
	start(): void;
	stop(): void;
	step(): void;
	readonly lastObservation: Float32Array | Float64Array | number[] | null;
}

/**
 * Framework-agnostic policy execution hook.
 *
 * Manages a decimation loop: calls `onObservation` to build observations
 * at the specified frequency, then calls `onAction` to apply the policy output.
 * The actual inference (ONNX, TF.js, custom) is the consumer's responsibility.
 *
 * Pass `options` as a getter so prop/state changes flow through reactively.
 */
export function usePolicy(getOptions: () => PolicyOptions): PolicyHandle {
	let lastActionTime = 0;
	let lastObservation = $state<Float32Array | Float64Array | number[] | null>(null);
	let isRunning = $state(true);
	let forceStep = false;

	useBeforePhysicsStep((model, data) => {
		if (!isRunning && !forceStep) return;

		const opts = getOptions();
		const interval = 1.0 / opts.frequency;

		if (forceStep || data.time - lastActionTime >= interval) {
			const obs = opts.onObservation(model, data);
			opts.onAction(obs, model, data);
			lastActionTime = data.time;
			lastObservation = obs;
			forceStep = false;
		}
	});

	return {
		get isRunning() {
			return isRunning;
		},
		start() {
			isRunning = true;
			lastActionTime = 0;
		},
		stop() {
			isRunning = false;
		},
		step() {
			forceStep = true;
		},
		get lastObservation() {
			return lastObservation;
		}
	};
}
