/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Register callbacks that run immediately before or after the physics step.
 *
 * These piggy-back on Threlte's task DAG via `{ before: PHYSICS_STEP_KEY }` /
 * `{ after: PHYSICS_STEP_KEY }`, so ordering is explicit and tasks show up in
 * Threlte devtools alongside any other `useTask` you register.
 */

import { useTask } from '@threlte/core';
import { useMujocoContext } from './context.js';
import { PHYSICS_STEP_KEY } from './frameKeys.js';
import type { PhysicsStepCallback } from '../types.js';

/**
 * Register a callback that runs right before each physics step.
 * The callback is skipped while the sim is paused or not yet ready.
 */
export function useBeforePhysicsStep(cb: PhysicsStepCallback): void {
	const sim = useMujocoContext();
	useTask(
		() => {
			if (sim.paused) return;
			const m = sim.mjModel;
			const d = sim.mjData;
			if (!m || !d) return;
			cb(m, d);
		},
		{ before: PHYSICS_STEP_KEY }
	);
}

/**
 * Register a callback that runs right after each physics step. Useful for
 * reading post-step state like `data.xpos` for visualization or event detection.
 */
export function useAfterPhysicsStep(cb: PhysicsStepCallback): void {
	const sim = useMujocoContext();
	useTask(
		() => {
			const m = sim.mjModel;
			const d = sim.mjData;
			if (!m || !d) return;
			cb(m, d);
		},
		{ after: PHYSICS_STEP_KEY }
	);
}
