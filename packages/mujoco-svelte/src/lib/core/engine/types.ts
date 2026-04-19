/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `SimEngine` — transport-agnostic interface for a MuJoCo instance. The only
 * implementation today is `LocalEngine` (WASM on the main thread); the
 * interface stays in place so alternate backends can slot in without
 * touching consumers.
 */

import type {
	MujocoData,
	MujocoModel,
	RayHit,
	SceneConfig,
	StateSnapshot
} from '../../types.js';

export type EngineStatus = 'loading' | 'ready' | 'error';

export interface StepOptions {
	/** If true, the engine does NO stepping (but pending reset/mutations still flush). */
	paused: boolean;
	/** Time-scale multiplier. Used by the engine to match sim time to wall time. */
	speed: number;
	/** mj_step calls per substep loop iteration. */
	substeps: number;
	/** When >0, overrides paused and runs exactly this many steps then returns. */
	stepsToRun: number;
}

export interface EngineEvents {
	/** Fired each time a step batch completes. */
	step: (time: number) => void;
	/** Fired once when the engine finishes loading. */
	ready: () => void;
	/** Fired on load/step errors. */
	error: (err: Error) => void;
	/** Fired after a reset completes. */
	reset: () => void;
	/** Fired during scene loading — useful for download progress UI. */
	progress: (message: string) => void;
}

/**
 * Backend-agnostic simulation interface.
 *
 * Implementations must keep `model` / `data` shape-compatible with `MujocoModel`
 * / `MujocoData` from the WASM bindings so existing consumers (SceneRenderer,
 * useBodyState, etc.) don't need to know which backend is serving them.
 */
export interface SimEngine {
	readonly status: EngineStatus;
	readonly error: string | null;
	config: SceneConfig;

	/** Model topology. `null` until `status === 'ready'`. */
	readonly model: MujocoModel | null;
	/** Per-step state. `null` until `status === 'ready'`. */
	readonly data: MujocoData | null;

	/** Wall-clock simulated time (seconds). Live each step. */
	readonly time: number;

	/**
	 * Final post-patch XML text of the most recently-loaded main scene file
	 * (after scene object injection + xmlPatches). `null` before `init()`
	 * resolves.
	 */
	readonly currentXml: string | null;

	/**
	 * Retained post-patch XML for every file that was downloaded for the
	 * current scene — the main scene plus every `<include>`d file.
	 */
	readonly currentXmlFiles: Map<string, string> | null;

	/** Load the scene for the first time. Must be called exactly once. */
	init(): Promise<void>;

	/** Release WASM resources. Idempotent. */
	dispose(): void;

	/** Advance the simulation by `delta` wall-seconds (scaled by `speed`). */
	step(delta: number, opts: StepOptions): void;

	/** Reset to the home pose + run mj_forward. */
	reset(): Promise<void>;

	/** Apply a named/indexed keyframe. */
	applyKeyframe(nameOrIndex: string | number): Promise<void>;

	/** Replace the loaded scene. */
	loadScene(config: SceneConfig): Promise<void>;

	/**
	 * Reload the model from a raw XML string. Only the main scene file
	 * (`config.sceneFile`) is overwritten; other files stay mounted on the
	 * virtual filesystem.
	 */
	reloadFromXml(xml: string): Promise<void>;

	/**
	 * Multi-file variant of `reloadFromXml`. Each entry in `files` is written
	 * to the backend's virtual FS at its key (a MuJoCo-relative path); the
	 * scene file is then recompiled. Files omitted from the map keep whatever
	 * was last written.
	 */
	reloadFromFiles(files: Map<string, string>): Promise<void>;

	/** Snapshot time + qpos/qvel/ctrl/act/qfrc_applied. */
	saveState(): Promise<StateSnapshot>;

	/** Restore a snapshot + run mj_forward. */
	restoreState(snap: StateSnapshot): Promise<void>;

	/** Domain randomization — mutate model in place. */
	setBodyMass(bodyName: string, mass: number): void;
	setGeomFriction(geomName: string, friction: [number, number, number]): void;
	setGeomSize(geomName: string, size: [number, number, number]): void;

	/** Force application — applied before the next step. */
	applyForce(body: string | number, fx: number, fy: number, fz: number, px?: number, py?: number, pz?: number): void;
	applyTorque(body: string | number, tx: number, ty: number, tz: number): void;
	setExternalForce(body: string | number, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void;

	/** Cast a ray against the MuJoCo collision world. */
	raycast(
		origin: { x: number; y: number; z: number },
		direction: { x: number; y: number; z: number },
		maxDist?: number
	): Promise<RayHit | null>;

	/** Subscribe to an engine event. Returns an unsubscribe function. */
	on<K extends keyof EngineEvents>(event: K, cb: EngineEvents[K]): () => void;
}
