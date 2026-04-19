/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Register the baseline scene-viewer commands (selection, camera, sim
 * control) against the shared `commands` registry. Called once from the
 * page-level `+page.svelte` with the runtime stores it needs to dispatch.
 *
 * Split from the registry itself so other apps can reuse the registry with
 * their own command catalog.
 */
import type { CameraMode, MujocoSimState, Selection } from 'mujoco-svelte';
import type { CameraController } from '$lib/stores/cameraController.svelte.js';
import type { SceneState } from '$lib/stores/sceneState.svelte.js';
import { commands } from './registry.svelte.js';

export interface SceneCommandDeps {
	scene: SceneState;
	camera: CameraController;
}

function currentSim(scene: SceneState): MujocoSimState | null {
	return scene.sim;
}

/**
 * Register all built-in scene commands. Returns a teardown that unregisters
 * them — drive it from `$effect` so hot-reload doesn't leak stale handlers.
 */
export function registerSceneCommands(deps: SceneCommandDeps): () => void {
	const { scene, camera } = deps;
	const offs: Array<() => void> = [];

	// ---- Selection ----
	offs.push(
		commands.register({
			id: 'selection.clear',
			label: 'Clear selection',
			run: () => {
				const sim = currentSim(scene);
				if (sim) sim.selection = null;
			}
		}),
		commands.register({
			id: 'selection.set',
			label: 'Set selection',
			run: (sel: unknown) => {
				const sim = currentSim(scene);
				if (!sim) return;
				sim.selection = (sel as Selection | null) ?? null;
			}
		})
	);

	// ---- Camera ----
	offs.push(
		commands.register({
			id: 'camera.focus',
			label: 'Focus on point',
			run: (point: unknown) => {
				camera.focusOn(point as [number, number, number]);
			}
		}),
		commands.register({
			id: 'camera.followSelection',
			label: 'Focus on current selection',
			run: () => {
				const sim = currentSim(scene);
				if (!sim || !sim.selection) return;
				camera.followSelection(sim, sim.selection);
			}
		}),
		commands.register({
			id: 'camera.setMode',
			label: 'Set camera mode',
			run: (mode: unknown) => {
				camera.mode = mode as CameraMode;
			}
		}),
		commands.register({
			id: 'camera.free',
			label: 'Free camera',
			run: () => {
				camera.mode = 'free';
			}
		}),
		commands.register({
			id: 'camera.resetView',
			label: 'Reset view',
			run: () => {
				camera.resetView();
			}
		}),
		commands.register({
			id: 'camera.cycleNamed',
			label: 'Cycle named cameras',
			run: (dir: unknown) => {
				const sim = currentSim(scene);
				if (!sim) return;
				const cams = sim.cameras;
				if (cams.length === 0) return;
				const step = (dir as number) ?? 1;
				const mode = camera.mode;
				const cur = typeof mode === 'object' && mode.kind === 'fixed' ? mode.id : -1;
				const next = (cur + step + cams.length) % cams.length;
				camera.mode = { kind: 'fixed', id: next };
			}
		})
	);

	// ---- Sim control ----
	offs.push(
		commands.register({
			id: 'sim.togglePause',
			label: 'Pause / resume simulation',
			run: () => {
				scene.paused = !scene.paused;
			}
		}),
		commands.register({
			id: 'sim.pause',
			label: 'Pause',
			run: () => {
				scene.paused = true;
			}
		}),
		commands.register({
			id: 'sim.resume',
			label: 'Resume',
			run: () => {
				scene.paused = false;
			}
		}),
		commands.register({
			id: 'sim.reset',
			label: 'Reset',
			run: () => {
				const sim = currentSim(scene);
				if (!sim) return;
				void sim.api.reset();
			}
		})
	);

	return () => {
		for (const off of offs) off();
	};
}
