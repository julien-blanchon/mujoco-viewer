/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Svelte context keys for MuJoCo providers.
 * Keys are symbols so they never collide with user or Threlte context.
 */

import { getContext } from 'svelte';
import type { MujocoWasmState } from './state/MujocoWasmState.svelte.js';
import type { MujocoSimState } from './state/MujocoSimState.svelte.js';

export const MUJOCO_WASM_KEY: unique symbol = Symbol('mujoco-svelte:wasm');
export const MUJOCO_SIM_KEY: unique symbol = Symbol('mujoco-svelte:sim');

/** Access the MuJoCo WASM state. Must be called inside a <MujocoProvider>. */
export function useMujocoWasm(): MujocoWasmState {
	const ctx = getContext<MujocoWasmState | undefined>(MUJOCO_WASM_KEY);
	if (!ctx) {
		throw new Error(
			'useMujocoWasm() must be called inside a <MujocoProvider>. ' +
				'Wrap your component tree with <MujocoProvider>.'
		);
	}
	return ctx;
}

/** Access the MuJoCo simulation state. Must be called inside a <MujocoCanvas> / <MujocoPhysics>. */
export function useMujocoContext(): MujocoSimState {
	const ctx = getContext<MujocoSimState | undefined>(MUJOCO_SIM_KEY);
	if (!ctx) {
		throw new Error(
			'useMujocoContext() must be called inside a <MujocoCanvas> or <MujocoPhysics>. ' +
				'Wrap your scene with <MujocoCanvas config={...}>.'
		);
	}
	return ctx;
}
