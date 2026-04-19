/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Top-level scene state — holds the `SceneConfig` resolved from the host
 * adapter, whether physics is paused, and the bridged sim state for DOM
 * panels. The store has no concept of preset scenes; it only mirrors what
 * the VSCode host (or browser debug app) hands us.
 *
 * `sim` is `$state.raw` to avoid deep-proxying Three.js / WASM objects the
 * `MujocoSimState` class holds.
 */
import type { MujocoSimState, SceneConfig } from 'mujoco-svelte';
import type { SceneStatsSnapshot } from '$lib/SceneStats.svelte';

export class SceneState {
	/** Configuration handed in by the host adapter. `null` until the initial load resolves. */
	config = $state<SceneConfig | null>(null);
	paused = $state(true);

	/** Bridged out of `<MujocoPhysics>` by `<SimBridge>` so DOM panels can read it. */
	sim = $state.raw<MujocoSimState | null>(null);

	// Status mirrored out of the provider so loading overlays can render outside
	// the canvas tree (where they can't intercept pointer events).
	stats = $state<SceneStatsSnapshot | null>(null);
	status = $state<'loading' | 'ready' | 'error'>('loading');
	sceneError = $state<string | null>(null);
	loadProgress = $state<string | null>(null);

	/** Identity key for `{#key …}` remounts when the loaded file changes. */
	get mountKey(): string {
		return this.config ? `${this.config.src}|${this.config.sceneFile}` : 'empty';
	}
}
