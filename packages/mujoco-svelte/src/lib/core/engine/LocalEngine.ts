/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `LocalEngine` — runs MuJoCo WASM on the main thread.
 *
 * This is the zero-latency backend: `data.xpos` is a live view into WASM
 * memory, mutations are immediate, and all lifecycle methods resolve
 * synchronously.
 */

import * as THREE from 'three';
import type {
	MujocoData,
	MujocoModel,
	MujocoModule,
	RayHit,
	SceneConfig,
	StateSnapshot
} from '../../types.js';
import {
	findActuatorByName,
	findBodyByName,
	findGeomByName,
	findKeyframeByName,
	getActuatedScalarQposAdr,
	loadFromFiles,
	loadScene
} from '../SceneLoader.js';
import type { EngineEvents, EngineStatus, SimEngine, StepOptions } from './types.js';

// Preallocated scratch for applyForce / applyTorque / raycast.
const _f = new Float64Array(3);
const _t = new Float64Array(3);
const _p = new Float64Array(3);
const _rayPnt = new Float64Array(3);
const _rayVec = new Float64Array(3);
const _rayGeomId = new Int32Array(1);

export class LocalEngine implements SimEngine {
	readonly mujoco: MujocoModule;

	status: EngineStatus = 'loading';
	error: string | null = null;
	config: SceneConfig;

	model: MujocoModel | null = null;
	data: MujocoData | null = null;
	/** Retained post-patch XML from the most recent `loadScene`. */
	currentXml: string | null = null;
	/**
	 * Retained post-patch XML for every file touched by the most recent load —
	 * the main scene file under `config.sceneFile` plus every `<include>`d
	 * file. Used by the editor pipeline so edits to include-file entities can
	 * splice the right file instead of operating only on the main scene text.
	 */
	currentXmlFiles: Map<string, string> | null = null;

	get time(): number {
		return this.data?.time ?? 0;
	}

	#loadGen = 0;
	#disposed = false;
	#stepsToRun = 0;
	/** Set once `mj_step` has thrown. Further steps are no-ops. */
	#crashed = false;
	#listeners: Partial<Record<keyof EngineEvents, Set<(...args: unknown[]) => void>>> = {};

	constructor(mujoco: MujocoModule, config: SceneConfig) {
		this.mujoco = mujoco;
		this.config = config;
	}

	async init(): Promise<void> {
		try {
			const result = await loadScene(this.mujoco, this.config, (msg) =>
				this.#emit('progress', msg)
			);
			if (this.#disposed) {
				result.mjModel.delete();
				result.mjData.delete();
				return;
			}
			this.model = result.mjModel;
			this.data = result.mjData;
			this.currentXml = result.xml;
			this.currentXmlFiles = result.xmlFiles;
			this.status = 'ready';
			this.#emit('ready');
		} catch (e) {
			if (this.#disposed) return;
			const err = e instanceof Error ? e : new Error(String(e));
			this.error = err.message;
			this.status = 'error';
			this.#emit('error', err);
		}
	}

	dispose(): void {
		this.#disposed = true;
		this.#loadGen++;
		this.model?.delete();
		this.data?.delete();
		this.model = null;
		this.data = null;
		try {
			this.mujoco.FS.unmount('/working');
		} catch {
			/* ignore */
		}
	}

	step(delta: number, opts: StepOptions): void {
		const model = this.model;
		const data = this.data;
		if (!model || !data || this.#crashed) return;

		const shouldStep = !opts.paused || this.#stepsToRun > 0 || opts.stepsToRun > 0;
		if (!shouldStep) return;

		// `mj_step` can hit a WASM "Out of bounds memory access" on scenes with
		// degenerate geometry. Catch it here — setting `#crashed` so we don't
		// keep hammering the broken physics each frame — and surface the error
		// to the UI via the engine's `error` event. The model/data are kept
		// around so the scene stays rendered at its last valid pose.
		try {
			for (let i = 0; i < model.nv; i++) data.qfrc_applied[i] = 0;

			const mujoco = this.mujoco;
			if (opts.stepsToRun > 0) {
				for (let s = 0; s < opts.stepsToRun; s++) mujoco.mj_step(model, data);
			} else if (this.#stepsToRun > 0) {
				for (let s = 0; s < this.#stepsToRun; s++) mujoco.mj_step(model, data);
				this.#stepsToRun = 0;
			} else {
				const startSimTime = data.time;
				const clampedDelta = Math.min(delta, 1 / 15);
				const frameTime = clampedDelta * opts.speed;
				while (data.time - startSimTime < frameTime) {
					for (let s = 0; s < opts.substeps; s++) mujoco.mj_step(model, data);
				}
			}
			this.#emit('step', data.time);
		} catch (e) {
			this.#crashed = true;
			const raw = e instanceof Error ? e.message : String(e);
			this.error = `Physics step crashed: ${raw}`;
			this.status = 'error';
			this.#emit('error', new Error(this.error));
		}
	}

	async reset(): Promise<void> {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return;

		this.mujoco.mj_resetData(model, data);

		const homeJoints = this.config.homeJoints;
		if (homeJoints) {
			const homeCount = Math.min(homeJoints.length, model.nu);
			for (let i = 0; i < homeCount; i++) {
				data.ctrl[i] = homeJoints[i];
				const qposAdr = getActuatedScalarQposAdr(model, i);
				if (qposAdr !== -1) data.qpos[qposAdr] = homeJoints[i];
			}
		}
		this.config.onReset?.(model, data);
		try {
			this.mujoco.mj_forward(model, data);
		} catch {
			try {
				this.mujoco.mj_kinematics(model, data);
			} catch {
				/* ignore */
			}
		}
		// Give the user a chance to resume physics after a reset.
		this.#crashed = false;
		this.error = null;
		if (this.status === 'error') this.status = 'ready';
		this.#emit('reset');
	}

	async applyKeyframe(nameOrIndex: string | number): Promise<void> {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return;

		const keyId =
			typeof nameOrIndex === 'number' ? nameOrIndex : findKeyframeByName(model, nameOrIndex);
		if (keyId < 0 || keyId >= model.nkey) {
			console.warn(`applyKeyframe: keyframe "${nameOrIndex}" not found`);
			return;
		}

		const { nq, nu } = model;
		const qposOffset = keyId * nq;
		for (let i = 0; i < nq; i++) data.qpos[i] = model.key_qpos[qposOffset + i];
		const ctrlOffset = keyId * nu;
		for (let i = 0; i < nu; i++) data.ctrl[i] = model.key_ctrl[ctrlOffset + i];
		if (model.key_qvel) {
			const qvelOffset = keyId * model.nv;
			for (let i = 0; i < model.nv; i++) data.qvel[i] = model.key_qvel[qvelOffset + i];
		}
		try {
			this.mujoco.mj_forward(model, data);
		} catch {
			try {
				this.mujoco.mj_kinematics(model, data);
			} catch {
				/* ignore */
			}
		}
		this.#emit('reset');
	}

	async loadScene(newConfig: SceneConfig): Promise<void> {
		const gen = ++this.#loadGen;
		try {
			this.model?.delete();
			this.data?.delete();
			this.model = null;
			this.data = null;
			this.status = 'loading';

			const result = await loadScene(this.mujoco, newConfig, (msg) =>
				this.#emit('progress', msg)
			);
			if (gen !== this.#loadGen) {
				result.mjModel.delete();
				result.mjData.delete();
				return;
			}
			this.model = result.mjModel;
			this.data = result.mjData;
			this.currentXml = result.xml;
			this.currentXmlFiles = result.xmlFiles;
			this.config = newConfig;
			this.status = 'ready';
			this.#crashed = false;
			this.error = null;
			// Emit `ready` so sim-level `load` subscribers fire on scene reload,
			// not just the initial `init()`. Matches the `reloadFromXml` path.
			this.#emit('ready');
		} catch (e) {
			if (gen !== this.#loadGen) return;
			const err = e instanceof Error ? e : new Error(String(e));
			this.error = err.message;
			this.status = 'error';
			this.#emit('error', err);
			throw err;
		}
	}

	async reloadFromXml(xml: string): Promise<void> {
		return this.reloadFromFiles(new Map([[this.config.sceneFile, xml]]));
	}

	async reloadFromFiles(files: Map<string, string>): Promise<void> {
		const gen = ++this.#loadGen;
		try {
			this.model?.delete();
			this.data?.delete();
			this.model = null;
			this.data = null;
			this.status = 'loading';

			// Merge: write every file the caller supplied, keep every other file
			// from the last successful load untouched on the VFS. Matters for
			// single-file edits that only touch one include — we don't want to
			// blank out the others or force the caller to pass the whole set.
			const merged = new Map<string, string>(this.currentXmlFiles ?? []);
			for (const [k, v] of files) merged.set(k, v);

			const result = loadFromFiles(this.mujoco, this.config.sceneFile, merged);
			if (gen !== this.#loadGen) {
				result.mjModel.delete();
				result.mjData.delete();
				return;
			}
			this.model = result.mjModel;
			this.data = result.mjData;
			this.currentXml = result.xml;
			this.currentXmlFiles = result.xmlFiles;
			this.status = 'ready';
			this.#crashed = false;
			this.error = null;
			this.#emit('ready');
		} catch (e) {
			if (gen !== this.#loadGen) return;
			const err = e instanceof Error ? e : new Error(String(e));
			this.error = err.message;
			this.status = 'error';
			this.#emit('error', err);
			throw err;
		}
	}

	async saveState(): Promise<StateSnapshot> {
		const data = this.data;
		if (!data) {
			return {
				time: 0,
				qpos: new Float64Array(0),
				qvel: new Float64Array(0),
				ctrl: new Float64Array(0),
				act: new Float64Array(0),
				qfrc_applied: new Float64Array(0)
			};
		}
		return {
			time: data.time,
			qpos: new Float64Array(data.qpos),
			qvel: new Float64Array(data.qvel),
			ctrl: new Float64Array(data.ctrl),
			act: new Float64Array(data.act),
			qfrc_applied: new Float64Array(data.qfrc_applied)
		};
	}

	async restoreState(snap: StateSnapshot): Promise<void> {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return;
		data.time = snap.time;
		data.qpos.set(snap.qpos);
		data.qvel.set(snap.qvel);
		data.ctrl.set(snap.ctrl);
		if (snap.act.length > 0) data.act.set(snap.act);
		data.qfrc_applied.set(snap.qfrc_applied);
		this.mujoco.mj_forward(model, data);
	}

	setBodyMass(bodyName: string, mass: number): void {
		const model = this.model;
		if (!model) return;
		const id = findBodyByName(model, bodyName);
		if (id < 0) return;
		model.body_mass[id] = mass;
	}

	setGeomFriction(geomName: string, friction: [number, number, number]): void {
		const model = this.model;
		if (!model) return;
		const id = findGeomByName(model, geomName);
		if (id < 0) return;
		model.geom_friction[id * 3] = friction[0];
		model.geom_friction[id * 3 + 1] = friction[1];
		model.geom_friction[id * 3 + 2] = friction[2];
	}

	setGeomSize(geomName: string, size: [number, number, number]): void {
		const model = this.model;
		if (!model) return;
		const id = findGeomByName(model, geomName);
		if (id < 0) return;
		model.geom_size[id * 3] = size[0];
		model.geom_size[id * 3 + 1] = size[1];
		model.geom_size[id * 3 + 2] = size[2];
	}

	#resolveBodyId(body: string | number): number {
		if (typeof body === 'number') return body;
		const model = this.model;
		return model ? findBodyByName(model, body) : -1;
	}

	applyForce(
		body: string | number,
		fx: number,
		fy: number,
		fz: number,
		px?: number,
		py?: number,
		pz?: number
	): void {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return;
		const id = this.#resolveBodyId(body);
		if (id < 0) return;
		_f[0] = fx;
		_f[1] = fy;
		_f[2] = fz;
		_t[0] = 0;
		_t[1] = 0;
		_t[2] = 0;
		if (px !== undefined && py !== undefined && pz !== undefined) {
			_p[0] = px;
			_p[1] = py;
			_p[2] = pz;
		} else {
			const i3 = id * 3;
			_p[0] = data.xpos[i3];
			_p[1] = data.xpos[i3 + 1];
			_p[2] = data.xpos[i3 + 2];
		}
		this.mujoco.mj_applyFT(model, data, _f, _t, _p, id, data.qfrc_applied);
	}

	applyTorque(body: string | number, tx: number, ty: number, tz: number): void {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return;
		const id = this.#resolveBodyId(body);
		if (id < 0) return;
		_f[0] = 0;
		_f[1] = 0;
		_f[2] = 0;
		_t[0] = tx;
		_t[1] = ty;
		_t[2] = tz;
		const i3 = id * 3;
		_p[0] = data.xpos[i3];
		_p[1] = data.xpos[i3 + 1];
		_p[2] = data.xpos[i3 + 2];
		this.mujoco.mj_applyFT(model, data, _f, _t, _p, id, data.qfrc_applied);
	}

	setExternalForce(
		body: string | number,
		fx: number,
		fy: number,
		fz: number,
		tx: number,
		ty: number,
		tz: number
	): void {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return;
		const id = this.#resolveBodyId(body);
		if (id < 0) return;
		const i6 = id * 6;
		data.xfrc_applied[i6] = tx;
		data.xfrc_applied[i6 + 1] = ty;
		data.xfrc_applied[i6 + 2] = tz;
		data.xfrc_applied[i6 + 3] = fx;
		data.xfrc_applied[i6 + 4] = fy;
		data.xfrc_applied[i6 + 5] = fz;
	}

	async raycast(
		origin: { x: number; y: number; z: number },
		direction: { x: number; y: number; z: number },
		maxDist = 100
	): Promise<RayHit | null> {
		const model = this.model;
		const data = this.data;
		if (!model || !data) return null;

		_rayPnt[0] = origin.x;
		_rayPnt[1] = origin.y;
		_rayPnt[2] = origin.z;
		const dx = direction.x;
		const dy = direction.y;
		const dz = direction.z;
		const len = Math.hypot(dx, dy, dz) || 1;
		_rayVec[0] = dx / len;
		_rayVec[1] = dy / len;
		_rayVec[2] = dz / len;
		_rayGeomId[0] = -1;

		try {
			const dist = this.mujoco.mj_ray(model, data, _rayPnt, _rayVec, null, 1, -1, _rayGeomId);
			if (dist < 0 || dist > maxDist) return null;
			const geomId = _rayGeomId[0];
			const bodyId = geomId >= 0 ? model.geom_bodyid[geomId] : -1;
			return {
				point: new THREE.Vector3(
					origin.x + _rayVec[0] * dist,
					origin.y + _rayVec[1] * dist,
					origin.z + _rayVec[2] * dist
				),
				bodyId,
				geomId,
				distance: dist
			};
		} catch {
			return null;
		}
	}

	/** Schedule N extra steps at the next call to `step()`. */
	scheduleSteps(n: number): void {
		this.#stepsToRun = n;
	}

	/** Helper: look up an actuator id by name. */
	findActuator(name: string): number {
		return this.model ? findActuatorByName(this.model, name) : -1;
	}

	on<K extends keyof EngineEvents>(event: K, cb: EngineEvents[K]): () => void {
		let set = this.#listeners[event];
		if (!set) {
			set = new Set();
			this.#listeners[event] = set;
		}
		set.add(cb as (...args: unknown[]) => void);
		return () => set!.delete(cb as (...args: unknown[]) => void);
	}

	#emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>): void {
		const set = this.#listeners[event];
		if (!set) return;
		for (const cb of set) cb(...args);
	}
}
