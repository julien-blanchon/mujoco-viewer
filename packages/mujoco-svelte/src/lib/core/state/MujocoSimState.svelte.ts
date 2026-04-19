/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reactive simulation context for <MujocoPhysics> / <MujocoCanvas>.
 *
 * Holds reactive `$state` for things components subscribe to (status, time,
 * paused/speed, introspection arrays, etc.) and delegates all WASM-touching
 * work to the `LocalEngine`.
 */

import type {
	ActuatorInfo,
	BodyInfo,
	CameraInfo,
	ContactInfo,
	EqualityInfo,
	GeomInfo,
	JointInfo,
	LightInfo,
	MaterialInfo,
	MeshInfo,
	MujocoData,
	MujocoModel,
	MujocoModule,
	MujocoSimAPI,
	SceneConfig,
	SelectedInfo,
	Selection,
	SensorInfo,
	SiteInfo,
	StateSnapshot,
	TendonInfo,
	TextureInfo
} from '../../types.js';
import { getContact } from '../../types.js';
import {
	findActuatorByName,
	findSensorByName,
	getName
} from '../SceneLoader.js';
import {
	EQUALITY_TYPE_NAMES,
	GEOM_TYPE_NAMES,
	JOINT_TYPE_NAMES,
	SENSOR_TYPE_NAMES,
	TEXTURE_TYPE_NAMES
} from '../constants.js';
import { LocalEngine } from '../engine/LocalEngine.js';
import type { SimEngine } from '../engine/types.js';
import { XmlIndex } from '../xml/XmlIndex.js';

/**
 * Resolve an `<include file="…"/>` reference against a loaded file map. Joins
 * the relative path to the including file's directory and normalizes `..`
 * segments the same way MuJoCo's loader does. Falls back to exact-match
 * lookups so callers passing pre-absolute keys (rare, but seen in test
 * fixtures) still work.
 */
function resolveIncludeAgainstFiles(
	files: Map<string, string>,
	relFile: string,
	fromFile: string
): { fname: string; text: string } | null {
	const fromDir = fromFile.includes('/')
		? fromFile.substring(0, fromFile.lastIndexOf('/') + 1)
		: '';
	const candidates: string[] = [];
	const joined = fromDir + relFile;
	candidates.push(normalizeMjcfPath(joined));
	if (relFile !== candidates[0]) candidates.push(relFile);
	for (const c of candidates) {
		const text = files.get(c);
		if (text !== undefined) return { fname: c, text };
	}
	return null;
}

function normalizeMjcfPath(input: string): string {
	// Mirror the normalization `SceneLoader.scanDependencies` uses so the keys
	// line up with whatever was downloaded into `xmlFiles`.
	const parts = input.replace(/\/\//g, '/').split('/');
	const norm: string[] = [];
	for (const p of parts) {
		if (p === '..') norm.pop();
		else if (p !== '.') norm.push(p);
	}
	return norm.join('/');
}

export interface MujocoSimStateOptions {
	/**
	 * Only needed when constructing the default `LocalEngine` internally. If
	 * you pass an `engine`, this is ignored.
	 */
	mujoco?: MujocoModule;
	config: SceneConfig;
	onReady?: (api: MujocoSimAPI) => void;
	onError?: (error: Error) => void;
	onStep?: (time: number) => void;
	onSelection?: (bodyId: number, name: string) => void;
	gravity?: [number, number, number];
	timestep?: number;
	substeps?: number;
	paused?: boolean;
	speed?: number;
	/** Pluggable backend. If omitted, a `LocalEngine` is built from `mujoco`. */
	engine?: SimEngine;
}

/**
 * Events emitted by `MujocoSimState`. Mirrors `EngineEvents` shape — forwarded
 * from the engine for `step` / `load` / `error` / `reset` / `progress` — and
 * adds a `selection` event that fires whenever `sim.selection` changes.
 *
 * Subscribe via `sim.on('selection', cb)`; the return value is an
 * unsubscribe function. Safe to attach before the engine is ready.
 */
export interface SimEvents {
	/** Fired every time the engine completes a step batch. */
	step: (time: number) => void;
	/** Fired once when the engine finishes loading the initial scene. */
	load: (api: MujocoSimAPI) => void;
	/** Fired on load/step errors. */
	error: (err: Error) => void;
	/** Fired after a reset completes. */
	reset: () => void;
	/** Fired during scene loading — useful for download progress UI. */
	progress: (message: string) => void;
	/** Fired when `sim.selection` changes (any kind, including clear). */
	selection: (selection: Selection | null) => void;
}

type Listener<K extends keyof SimEvents> = SimEvents[K];

export class MujocoSimState {
	// ---- Reactive state ----
	status = $state<'loading' | 'ready' | 'error'>('loading');
	/**
	 * Polymorphic selection — the currently inspected MJCF entity (body, geom,
	 * material, ...) or null. Prefer this over `selectedBodyId`, which is kept
	 * for back-compat and maps to `{ kind: 'body', id }`.
	 *
	 * Writing a new value fires the `selection` event. No-op writes (same object
	 * identity) skip the event.
	 */
	#selection = $state<Selection | null>(null);
	get selection(): Selection | null {
		return this.#selection;
	}
	set selection(sel: Selection | null) {
		if (this.#selection === sel) return;
		this.#selection = sel;
		this.#emit('selection', sel);
	}
	/**
	 * Geom currently under the pointer in the viewport, or null. Written by
	 * `<SceneRenderer>` (through `interactivity()`) and consumed by
	 * `<GeomHoverOverlay>` to draw hover edges + name billboard. It's safe to
	 * read from anywhere — reactive like any other `$state`.
	 */
	hoveredGeomId = $state<number | null>(null);
	paused = $state(false);
	speed = $state(1);
	time = $state(0);
	/** Latest message emitted by the scene loader during init / loadScene. */
	loadProgress = $state<string | null>(null);
	/** Latest error message when `status === 'error'`. */
	error = $state<string | null>(null);

	/**
	 * Back-compat accessor — reads/writes the polymorphic `selection` as a body
	 * id. Returns null for non-body selections. Writing a number sets a body
	 * selection; writing null clears.
	 */
	get selectedBodyId(): number | null {
		return this.selection?.kind === 'body' ? this.selection.id : null;
	}
	set selectedBodyId(id: number | null) {
		this.selection = id === null ? null : { kind: 'body', id };
	}

	// ---- Plain fields / delegated state ----
	readonly engine: SimEngine;
	substeps = 1;

	// ---- Event emitter ----
	#listeners: { [K in keyof SimEvents]?: Set<Listener<K>> } = {};

	/**
	 * Subscribe to a sim event. Returns an unsubscribe function. Safe to call
	 * before `init()` resolves — subscriptions are additive and fire in the
	 * order they were registered.
	 */
	on<K extends keyof SimEvents>(event: K, cb: Listener<K>): () => void {
		let set = this.#listeners[event] as Set<Listener<K>> | undefined;
		if (!set) {
			set = new Set<Listener<K>>();
			(this.#listeners as Record<string, Set<Listener<K>>>)[event] = set;
		}
		set.add(cb);
		return () => {
			set.delete(cb);
		};
	}

	#emit<K extends keyof SimEvents>(event: K, ...args: Parameters<Listener<K>>): void {
		const set = this.#listeners[event] as Set<Listener<K>> | undefined;
		if (!set || set.size === 0) return;
		for (const cb of set) {
			(cb as (...a: Parameters<Listener<K>>) => void)(...args);
		}
	}

	// ---- Reactive engine handles ----
	// We hold our own `$state.raw` references for model/data because
	// `engine.model` / `engine.data` are plain class fields — assignments to
	// them don't notify Svelte, so a `reloadFromXml` would silently swap the
	// model and leave every reactive consumer (`SceneRenderer`, all the
	// `$derived` introspection arrays) reading the *old* model. Updated from
	// `engine.on('ready', ...)` in the constructor so identity-change
	// reactivity flows through one reactive port.
	//
	// `$state.raw` (not `$state`) because both objects are deeply mutated by
	// MuJoCo every `mj_step` — proxying their internals would trash perf and
	// mis-trigger reactivity on every TypedArray write.
	#model = $state.raw<MujocoModel | null>(null);
	#data = $state.raw<MujocoData | null>(null);

	get mjModel(): MujocoModel | null {
		return this.#model;
	}
	get mjData(): MujocoData | null {
		return this.#data;
	}
	/** The raw WASM module from the underlying `LocalEngine`. */
	get mujoco(): MujocoModule {
		return (this.engine as LocalEngine).mujoco;
	}
	get config(): SceneConfig {
		return this.engine.config;
	}
	/**
	 * Final post-patch XML text of the most recently-loaded main scene file.
	 * Use as the source for an XML viewer/editor. Pair with `reloadFromXml`
	 * to apply user edits.
	 */
	get currentXml(): string | null {
		return this.engine.currentXml;
	}
	/** Post-patch XML for every file the current scene touches — main + `<include>`d files. */
	get currentXmlFiles(): Map<string, string> | null {
		return this.engine.currentXmlFiles;
	}
	reloadFromXml(xml: string): Promise<void> {
		return this.engine.reloadFromXml(xml);
	}
	reloadFromFiles(files: Map<string, string>): Promise<void> {
		return this.engine.reloadFromFiles(files);
	}

	/**
	 * Structured index of the current XML — entities (body / geom / joint /
	 * material / ...) bucketed by kind in compile order, with per-attribute
	 * byte ranges. Rebuilt automatically on every `engine.ready` event.
	 *
	 * Held as `$state.raw` because the index holds a Lezer Tree that mutates
	 * through internal caches; deep-proxying it would explode.
	 */
	#xmlIndex = $state.raw<XmlIndex | null>(null);
	get xmlIndex(): XmlIndex | null {
		return this.#xmlIndex;
	}

	// ---- Reactive model introspection ----
	readonly bodies: BodyInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const result: BodyInfo[] = [];
		for (let i = 0; i < model.nbody; i++) {
			result.push({
				id: i,
				name: getName(model, model.name_bodyadr[i]),
				mass: model.body_mass[i],
				parentId: model.body_parentid[i]
			});
		}
		return result;
	});

	readonly joints: JointInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const result: JointInfo[] = [];
		for (let i = 0; i < model.njnt; i++) {
			const type = model.jnt_type[i];
			const limited = model.jnt_limited ? model.jnt_limited[i] !== 0 : false;
			result.push({
				id: i,
				name: getName(model, model.name_jntadr[i]),
				type,
				typeName: JOINT_TYPE_NAMES[type] ?? `unknown(${type})`,
				range: [model.jnt_range[2 * i], model.jnt_range[2 * i + 1]],
				limited,
				bodyId: model.jnt_bodyid[i],
				qposAdr: model.jnt_qposadr[i],
				dofAdr: model.jnt_dofadr[i]
			});
		}
		return result;
	});

	readonly geoms: GeomInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const result: GeomInfo[] = [];
		for (let i = 0; i < model.ngeom; i++) {
			const type = model.geom_type[i];
			result.push({
				id: i,
				name: getName(model, model.name_geomadr[i]),
				type,
				typeName: GEOM_TYPE_NAMES[type] ?? `unknown(${type})`,
				size: [
					model.geom_size[3 * i],
					model.geom_size[3 * i + 1],
					model.geom_size[3 * i + 2]
				],
				bodyId: model.geom_bodyid[i]
			});
		}
		return result;
	});

	readonly sites: SiteInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const result: SiteInfo[] = [];
		for (let i = 0; i < model.nsite; i++) {
			result.push({
				id: i,
				name: getName(model, model.name_siteadr[i]),
				bodyId: model.site_bodyid ? model.site_bodyid[i] : -1
			});
		}
		return result;
	});

	readonly actuators: ActuatorInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const result: ActuatorInfo[] = [];
		for (let i = 0; i < model.nu; i++) {
			const hasRange =
				model.actuator_ctrlrange[2 * i] < model.actuator_ctrlrange[2 * i + 1];
			result.push({
				id: i,
				name: getName(model, model.name_actuatoradr[i]),
				range: hasRange
					? [model.actuator_ctrlrange[2 * i], model.actuator_ctrlrange[2 * i + 1]]
					: [-Infinity, Infinity]
			});
		}
		return result;
	});

	readonly sensors: SensorInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const result: SensorInfo[] = [];
		for (let i = 0; i < model.nsensor; i++) {
			const type = model.sensor_type[i];
			result.push({
				id: i,
				name: getName(model, model.name_sensoradr[i]),
				type,
				typeName: SENSOR_TYPE_NAMES[type] ?? `unknown(${type})`,
				dim: model.sensor_dim[i],
				adr: model.sensor_adr[i]
			});
		}
		return result;
	});

	readonly keyframeNames: string[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready') return [];
		const names: string[] = [];
		for (let i = 0; i < model.nkey; i++) names.push(getName(model, model.name_keyadr[i]));
		return names;
	});

	readonly cameras: CameraInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.ncam) return [];
		const result: CameraInfo[] = [];
		for (let i = 0; i < model.ncam; i++) {
			result.push({
				id: i,
				name: model.name_camadr ? getName(model, model.name_camadr[i]) : '',
				mode: model.cam_mode?.[i] ?? 0,
				bodyId: model.cam_bodyid?.[i] ?? -1,
				fovy: model.cam_fovy?.[i] ?? 45
			});
		}
		return result;
	});

	readonly lights: LightInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.nlight) return [];
		const result: LightInfo[] = [];
		for (let i = 0; i < model.nlight; i++) {
			result.push({
				id: i,
				name: model.name_lightadr ? getName(model, model.name_lightadr[i]) : '',
				type: model.light_type?.[i] ?? 0,
				bodyId: model.light_bodyid?.[i] ?? -1,
				active: (model.light_active?.[i] ?? 1) !== 0,
				castShadow: (model.light_castshadow?.[i] ?? 0) !== 0
			});
		}
		return result;
	});

	readonly materials: MaterialInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.nmat) return [];
		const rgba = model.mat_rgba as Float32Array | undefined;
		// mat_texid in MuJoCo 3.x is 2D: [matId * mjNTEXROLE + role]. Role 1 is
		// the diffuse/RGB slot. Fall back to the flat 1-slot layout for older
		// builds.
		const texArr = model.mat_texid as Int32Array | undefined;
		const texRoleOffset =
			texArr && texArr.length !== model.nmat ? 10 : 1;
		const texRoleSlot = texRoleOffset === 10 ? 1 : 0;
		const result: MaterialInfo[] = [];
		for (let i = 0; i < model.nmat; i++) {
			result.push({
				id: i,
				name: model.name_matadr ? getName(model, model.name_matadr[i]) : '',
				rgba: rgba
					? [rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2], rgba[4 * i + 3]]
					: [1, 1, 1, 1],
				emission: model.mat_emission?.[i] ?? 0,
				specular: model.mat_specular?.[i] ?? 0,
				shininess: model.mat_shininess?.[i] ?? 0,
				reflectance: model.mat_reflectance?.[i] ?? 0,
				texId: texArr ? (texArr[i * texRoleOffset + texRoleSlot] ?? -1) : -1,
				texRepeat: [
					model.mat_texrepeat?.[2 * i] ?? 1,
					model.mat_texrepeat?.[2 * i + 1] ?? 1
				],
				texUniform: (model.mat_texuniform?.[i] ?? 0) !== 0
			});
		}
		return result;
	});

	readonly textures: TextureInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.ntex) return [];
		const result: TextureInfo[] = [];
		for (let i = 0; i < model.ntex; i++) {
			const type = model.tex_type?.[i] ?? 0;
			result.push({
				id: i,
				name: model.name_texadr ? getName(model, model.name_texadr[i]) : '',
				type,
				typeName: TEXTURE_TYPE_NAMES[type] ?? `unknown(${type})`,
				width: model.tex_width?.[i] ?? 0,
				height: model.tex_height?.[i] ?? 0,
				nchannel: model.tex_nchannel?.[i] ?? 3
			});
		}
		return result;
	});

	readonly meshes: MeshInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.nmesh) return [];
		const result: MeshInfo[] = [];
		for (let i = 0; i < model.nmesh; i++) {
			result.push({
				id: i,
				name: model.name_meshadr ? getName(model, model.name_meshadr[i]) : '',
				vertCount: model.mesh_vertnum[i],
				faceCount: model.mesh_facenum[i]
			});
		}
		return result;
	});

	readonly tendons: TendonInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.ntendon) return [];
		// mujoco-js exposes some tendon arrays conditionally — guard every read so
		// scenes that use tendons but lack optional fields don't crash the tree.
		const result: TendonInfo[] = [];
		const range = model.ten_range as Float64Array | undefined;
		const rgba = model.ten_rgba as Float32Array | undefined;
		for (let i = 0; i < model.ntendon; i++) {
			result.push({
				id: i,
				name: model.name_tendonadr ? getName(model, model.name_tendonadr[i]) : '',
				range: range ? [range[2 * i], range[2 * i + 1]] : [0, 0],
				width: model.ten_width?.[i] ?? 0.003,
				rgba: rgba
					? [rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2], rgba[4 * i + 3]]
					: [0.3, 0.3, 0.8, 1],
				wrapCount: model.ten_wrapnum?.[i] ?? 0
			});
		}
		return result;
	});

	readonly equalities: EqualityInfo[] = $derived.by(() => {
		void this.status;
		const model = this.mjModel;
		if (!model || this.status !== 'ready' || !model.neq) return [];
		const result: EqualityInfo[] = [];
		for (let i = 0; i < model.neq; i++) {
			const type = model.eq_type?.[i] ?? 0;
			result.push({
				id: i,
				name: model.name_eqadr ? getName(model, model.name_eqadr[i]) : '',
				type,
				typeName: EQUALITY_TYPE_NAMES[type] ?? `unknown(${type})`,
				obj1Id: model.eq_obj1id?.[i] ?? -1,
				obj2Id: model.eq_obj2id?.[i] ?? -1,
				active: (model.eq_active?.[i] ?? 1) !== 0
			});
		}
		return result;
	});

	/**
	 * Resolve the currently selected entity to its typed Info record. Returns
	 * a discriminated union so `switch (info.kind)` narrows to the exact
	 * `*Info` shape for the selected entity.
	 */
	get selectedInfo(): SelectedInfo | null {
		const sel = this.selection;
		if (!sel) return null;
		switch (sel.kind) {
			case 'body': {
				const info = this.bodies[sel.id];
				return info ? { kind: 'body', info } : null;
			}
			case 'joint': {
				const info = this.joints[sel.id];
				return info ? { kind: 'joint', info } : null;
			}
			case 'geom': {
				const info = this.geoms[sel.id];
				return info ? { kind: 'geom', info } : null;
			}
			case 'site': {
				const info = this.sites[sel.id];
				return info ? { kind: 'site', info } : null;
			}
			case 'camera': {
				const info = this.cameras[sel.id];
				return info ? { kind: 'camera', info } : null;
			}
			case 'light': {
				const info = this.lights[sel.id];
				return info ? { kind: 'light', info } : null;
			}
			case 'material': {
				const info = this.materials[sel.id];
				return info ? { kind: 'material', info } : null;
			}
			case 'texture': {
				const info = this.textures[sel.id];
				return info ? { kind: 'texture', info } : null;
			}
			case 'mesh': {
				const info = this.meshes[sel.id];
				return info ? { kind: 'mesh', info } : null;
			}
			case 'tendon': {
				const info = this.tendons[sel.id];
				return info ? { kind: 'tendon', info } : null;
			}
			case 'actuator': {
				const info = this.actuators[sel.id];
				return info ? { kind: 'actuator', info } : null;
			}
			case 'sensor': {
				const info = this.sensors[sel.id];
				return info ? { kind: 'sensor', info } : null;
			}
			case 'equality': {
				const info = this.equalities[sel.id];
				return info ? { kind: 'equality', info } : null;
			}
			case 'keyframe': {
				const name = this.keyframeNames[sel.id];
				return name !== undefined
					? { kind: 'keyframe', info: { id: sel.id, name } }
					: null;
			}
		}
	}

	// ---- Internals ----
	#disposed = false;
	/**
	 * Unsubscribe functions from `engine.on(...)` subscriptions attached in
	 * the constructor. Called during `dispose()` so we don't leak listeners
	 * into a torn-down engine (especially relevant in HMR: each reload would
	 * double-attach and double-emit without this cleanup).
	 */
	#engineOffs: Array<() => void> = [];

	readonly api: MujocoSimAPI;

	constructor(options: MujocoSimStateOptions) {
		if (options.engine) {
			this.engine = options.engine;
		} else if (options.mujoco) {
			this.engine = new LocalEngine(options.mujoco, options.config);
		} else {
			throw new Error('MujocoSimState requires either `engine` or `mujoco` in options.');
		}
		this.paused = options.paused ?? false;
		this.speed = options.speed ?? 1;
		this.substeps = options.substeps ?? 1;

		// Build api up front so `load` subscribers (including legacy onReady) see
		// the resolved handle.
		this.api = this.#buildApi();

		// Forward engine events → reactive $state → sim emitter. Every
		// subscription is tracked in `#engineOffs` for cleanup on dispose.
		this.#engineOffs.push(
			this.engine.on('ready', () => {
				// Snapshot the engine's current handles into our reactive refs.
				// This is what makes `sim.mjModel` / `sim.mjData` re-trigger
				// reactivity on reload — without these assignments, the engine
				// swaps internally but every Svelte consumer keeps reading the
				// stale model.
				this.#model = this.engine.model;
				this.#data = this.engine.data;
				this.status = 'ready';
				this.time = this.engine.time;
				this.loadProgress = null;
				this.error = null;
				// Rebuild XML index whenever the engine reports a new model. This
				// catches both the initial `loadScene` and any `reloadFromXml` from
				// the editor pipeline. Supply a resolver that consults the
				// engine-tracked include-file texts so entities defined inside
				// `<include>`d files end up indexed in compile order.
				const xml = this.engine.currentXml;
				const sourceFile = this.engine.config.sceneFile;
				const files = this.engine.currentXmlFiles;
				this.#xmlIndex = xml
					? new XmlIndex(xml, {
							sourceFile,
							resolveInclude: files
								? (relFile, fromFile) => resolveIncludeAgainstFiles(files, relFile, fromFile)
								: undefined
						})
					: null;
				this.#emit('load', this.api);
			}),
			this.engine.on('error', (err) => {
				this.status = 'error';
				this.error = err.message;
				this.#emit('error', err);
			}),
			this.engine.on('step', (t) => {
				this.time = t;
				this.#emit('step', t);
			}),
			this.engine.on('reset', () => {
				this.#emit('reset');
			}),
			this.engine.on('progress', (msg) => {
				this.loadProgress = msg;
				this.#emit('progress', msg);
			})
		);

		// Legacy option callbacks — wire them through the new emitter so
		// consumers can still pass `onStep` / `onSelection` as constructor
		// options without switching to `sim.on(...)` by hand.
		if (options.onReady) this.on('load', options.onReady);
		if (options.onError) this.on('error', options.onError);
		if (options.onStep) this.on('step', options.onStep);
		if (options.onSelection) {
			this.on('selection', (sel) => {
				if (sel?.kind !== 'body') return;
				const model = this.engine.model;
				const name = model ? getName(model, model.name_bodyadr[sel.id]) : '';
				options.onSelection!(sel.id, name);
			});
		}

		// Apply initial gravity/timestep overrides via the engine's model once ready.
		if (options.gravity || options.timestep !== undefined) {
			this.#engineOffs.push(
				this.engine.on('ready', () => {
					const model = this.engine.model;
					if (!model?.opt) return;
					if (options.gravity) {
						model.opt.gravity[0] = options.gravity[0];
						model.opt.gravity[1] = options.gravity[1];
						model.opt.gravity[2] = options.gravity[2];
					}
					if (options.timestep !== undefined) model.opt.timestep = options.timestep;
				})
			);
		}
	}

	/** Run one physics frame — called by Threlte's useTask with priority -1. */
	step(delta: number): void {
		this.engine.step(delta, {
			paused: this.paused,
			speed: this.speed,
			substeps: this.substeps,
			stepsToRun: 0
		});
	}

	async init(): Promise<void> {
		try {
			if (this.engine.status === 'loading') await this.engine.init();
			if (this.#disposed) return;
		} catch (e) {
			if (this.#disposed) return;
			const err = e instanceof Error ? e : new Error(String(e));
			this.status = 'error';
			this.error = err.message;
			this.#emit('error', err);
		}
	}

	dispose(): void {
		this.#disposed = true;
		// Detach every engine listener we attached in the constructor. Without
		// this, re-mounting the provider (HMR, route nav) would leave dead
		// listeners bound to the old engine instance.
		for (const off of this.#engineOffs) off();
		this.#engineOffs = [];
		// Clear sim-side subscriptions too. Late emitters that race disposal
		// (e.g. an in-flight step) should find an empty map and no-op.
		this.#listeners = {};
		this.engine.dispose();
	}

	// --- Public API — mostly forwards to the engine. ---
	#buildApi(): MujocoSimAPI {
		const self = this;
		const engine = this.engine;

		return {
			reset: () => engine.reset(),
			step: (n = 1) => {
				// Fire-and-forget — local engine supports scheduleSteps; worker too.
				(engine as unknown as { scheduleSteps?: (n: number) => void }).scheduleSteps?.(n);
			},
			applyKeyframe: (nameOrIndex) => engine.applyKeyframe(nameOrIndex),
			loadScene: (newConfig) => engine.loadScene(newConfig),
			saveState: () => engine.saveState() as unknown as StateSnapshot,
			restoreState: (snap) => void engine.restoreState(snap),

			setQpos: (values: Float64Array | number[]) => {
				const model = self.mjModel;
				const data = self.mjData;
				if (!model || !data) return;
				const arr = values instanceof Float64Array ? values : new Float64Array(values);
				data.qpos.set(arr.subarray(0, Math.min(arr.length, model.nq)));
				self.mujoco.mj_forward(model, data);
			},
			setQvel: (values: Float64Array | number[]) => {
				const data = self.mjData;
				if (!data) return;
				const arr = values instanceof Float64Array ? values : new Float64Array(values);
				data.qvel.set(arr.subarray(0, Math.min(arr.length, self.mjModel?.nv ?? 0)));
			},
			getQpos: () =>
				self.mjData ? new Float64Array(self.mjData.qpos) : new Float64Array(0),
			getQvel: () =>
				self.mjData ? new Float64Array(self.mjData.qvel) : new Float64Array(0),

			setCtrl: (nameOrValues: string | Record<string, number>, value?: number) => {
				const model = self.mjModel;
				const data = self.mjData;
				if (!model || !data) return;
				if (typeof nameOrValues === 'string') {
					const id = findActuatorByName(model, nameOrValues);
					if (id >= 0 && value !== undefined) data.ctrl[id] = value;
				} else {
					for (const [name, val] of Object.entries(nameOrValues)) {
						const id = findActuatorByName(model, name);
						if (id >= 0) data.ctrl[id] = val;
					}
				}
			},
			getCtrl: () =>
				self.mjData ? new Float64Array(self.mjData.ctrl) : new Float64Array(0),

			applyForce: (bodyName, force, point) =>
				engine.applyForce(
					bodyName,
					force.x,
					force.y,
					force.z,
					point?.x,
					point?.y,
					point?.z
				),
			applyTorque: (bodyName, torque) =>
				engine.applyTorque(bodyName, torque.x, torque.y, torque.z),
			setExternalForce: (bodyName, force, torque) =>
				engine.setExternalForce(
					bodyName,
					force.x,
					force.y,
					force.z,
					torque.x,
					torque.y,
					torque.z
				),
			applyGeneralizedForce: (values: Float64Array | number[]) => {
				const data = self.mjData;
				if (!data) return;
				const nv = self.mjModel?.nv ?? 0;
				for (let i = 0; i < Math.min(values.length, nv); i++) {
					data.qfrc_applied[i] += values[i];
				}
			},

			getSensorData: (name: string): Float64Array | null => {
				const model = self.mjModel;
				const data = self.mjData;
				if (!model || !data) return null;
				const id = findSensorByName(model, name);
				if (id < 0) return null;
				const adr = model.sensor_adr[id];
				const dim = model.sensor_dim[id];
				return new Float64Array(data.sensordata.subarray(adr, adr + dim));
			},

			getContacts: (): ContactInfo[] => {
				const model = self.mjModel;
				const data = self.mjData;
				if (!model || !data) return [];
				const contacts: ContactInfo[] = [];
				const ncon = data.ncon;
				for (let i = 0; i < ncon; i++) {
					const c = getContact(data, i);
					if (!c) break;
					contacts.push({
						geom1: c.geom1,
						geom1Name: getName(model, model.name_geomadr[c.geom1]),
						geom2: c.geom2,
						geom2Name: getName(model, model.name_geomadr[c.geom2]),
						pos: [c.pos[0], c.pos[1], c.pos[2]],
						depth: c.dist
					});
				}
				return contacts;
			},

			setBodyMass: (name, mass) => engine.setBodyMass(name, mass),
			setGeomFriction: (name, friction) => engine.setGeomFriction(name, friction),
			setGeomSize: (name, size) => engine.setGeomSize(name, size)
		};
	}
}
