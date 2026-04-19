/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Well-known Threlte task keys. Components can reference these to schedule
 * per-frame work relative to the physics step.
 *
 * The physics step is registered with PHYSICS_STEP_KEY; rendering-side tasks
 * (Body/SceneRenderer/SitePosition/etc.) declare `after: PHYSICS_STEP_KEY` so
 * they see the freshly stepped state before the frame renders.
 */

export const PHYSICS_STEP_KEY = 'mujoco-svelte:physics-step';
