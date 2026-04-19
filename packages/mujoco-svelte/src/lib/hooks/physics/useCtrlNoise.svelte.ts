/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useCtrlNoise — control noise / perturbation hook (spec 3.2)
 */

import { useMujocoContext } from '../../core/context.js';
import { useBeforePhysicsStep } from '../../core/physicsStep.svelte.js';

export interface CtrlNoiseOptions {
	/** Exponential filter rate (0-1). Higher = faster noise changes. Default: 0.01. */
	rate?: number;
	/** Standard deviation of Gaussian noise. Default: 0.05. */
	std?: number;
	/** Enable/disable. Default: true. */
	enabled?: boolean;
}

/**
 * Apply Gaussian noise with exponential filtering to all ctrl values.
 * Useful for robustness testing and domain randomization.
 *
 *     noise[i] = (1 - rate) * noise[i] + rate * N(0, std)
 *     data.ctrl[i] += noise[i]
 *
 * Pass `options` as a getter so prop/state changes flow through reactively.
 */
export function useCtrlNoise(getOptions: () => CtrlNoiseOptions = () => ({})): void {
	const sim = useMujocoContext();
	let noise: Float64Array | null = null;

	useBeforePhysicsStep((_model, data) => {
		const opts = getOptions();
		if (opts.enabled === false) return;

		const rate = opts.rate ?? 0.01;
		const std = opts.std ?? 0.05;
		const nu = sim.mjModel?.nu ?? 0;
		if (nu === 0) return;

		if (!noise || noise.length !== nu) noise = new Float64Array(nu);

		for (let i = 0; i < nu; i++) {
			const u1 = Math.random();
			const u2 = Math.random();
			const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
			noise[i] = (1 - rate) * noise[i] + rate * gaussian * std;
			data.ctrl[i] += noise[i];
		}
	});
}
