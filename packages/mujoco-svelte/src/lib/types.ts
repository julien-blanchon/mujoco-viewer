/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { Snippet } from 'svelte';

// ---- Register (type-safe named resources) ----

/**
 * Module augmentation interface for type-safe resource names.
 *
 * Declare your model's resource names via module augmentation:
 * ```ts
 * declare module 'mujoco-svelte' {
 *   interface Register {
 *     actuators: 'joint1' | 'joint2' | 'gripper';
 *     sensors: 'force_sensor' | 'torque_sensor';
 *     bodies: 'link0' | 'link1' | 'hand';
 *   }
 * }
 * ```
 *
 * When no augmentation is declared, all names fall back to `string`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

export type Actuators = Register extends { actuators: infer T extends string } ? T : string;
export type Sensors = Register extends { sensors: infer T extends string } ? T : string;
export type Bodies = Register extends { bodies: infer T extends string } ? T : string;
export type Joints = Register extends { joints: infer T extends string } ? T : string;
export type Sites = Register extends { sites: infer T extends string } ? T : string;
export type Geoms = Register extends { geoms: infer T extends string } ? T : string;
export type Keyframes = Register extends { keyframes: infer T extends string } ? T : string;

// ---- MuJoCo WASM Types ----

/**
 * A single MuJoCo contact from the WASM module.
 * Accessed via `data.contact.get(i)`.
 */
export interface MujocoContact {
	geom1: number;
	geom2: number;
	pos: Float64Array;
	frame: Float64Array;
	dist: number;
}

/**
 * WASM contact array — supports indexed access via `.get(i)`.
 */
export interface MujocoContactArray {
	get(i: number): MujocoContact | undefined;
}

/**
 * Read a single contact from the WASM contact array.
 * Returns undefined if the access fails (WASM heap issue, bad index, etc.).
 */
export function getContact(data: MujocoData, i: number): MujocoContact | undefined {
	try {
		return data.contact.get(i);
	} catch {
		return undefined;
	}
}

/**
 * Minimal interface for MuJoCo Model to avoid 'any'.
 */
export interface MujocoModel {
	// Counts
	nbody: number;
	ngeom: number;
	nsite: number;
	nu: number;
	njnt: number;
	nq: number;
	nv: number;
	nkey: number;
	nsensor: number;
	nsensordata: number;
	nlight: number;
	ntendon: number;
	nflex: number;
	nmesh: number;
	nmat: number;
	ntex: number;
	ncam: number;
	neq: number;

	// Name tables
	names: Int8Array;
	name_bodyadr: Int32Array;
	name_jntadr: Int32Array;
	name_geomadr: Int32Array;
	name_siteadr: Int32Array;
	name_actuatoradr: Int32Array;
	name_keyadr: Int32Array;
	name_sensoradr: Int32Array;
	name_tendonadr: Int32Array;
	name_meshadr: Int32Array;
	name_matadr: Int32Array;
	name_texadr: Int32Array;
	name_camadr: Int32Array;
	name_lightadr: Int32Array;
	name_eqadr: Int32Array;

	// Body
	body_mass: Float64Array;
	body_parentid: Int32Array;
	body_jntnum: Int32Array;
	body_jntadr: Int32Array;
	body_pos: Float64Array;
	body_quat: Float64Array;
	body_geomnum: Int32Array;
	body_geomadr: Int32Array;
	body_inertia: Float64Array;

	// Default configuration
	qpos0: Float64Array;

	// Joint
	jnt_qposadr: Int32Array;
	jnt_dofadr: Int32Array;
	jnt_type: Int32Array;
	jnt_range: Float64Array;
	jnt_bodyid: Int32Array;
	jnt_pos: Float64Array;
	jnt_axis: Float64Array;
	jnt_limited: Uint8Array;

	// Geom
	geom_group: Int32Array;
	geom_type: Int32Array;
	geom_size: Float64Array;
	geom_pos: Float64Array;
	geom_quat: Float64Array;
	geom_matid: Int32Array;
	geom_rgba: Float32Array;
	geom_dataid: Int32Array;
	geom_bodyid: Int32Array;
	geom_contype: Int32Array;
	geom_conaffinity: Int32Array;
	geom_friction: Float64Array;

	// Material
	mat_rgba: Float32Array;
	mat_texid?: Int32Array;
	mat_texrepeat?: Float32Array;
	mat_texuniform?: Uint8Array;
	mat_emission?: Float32Array;
	mat_specular?: Float32Array;
	mat_shininess?: Float32Array;
	mat_reflectance?: Float32Array;

	// Texture
	tex_type?: Int32Array;
	tex_height?: Int32Array;
	tex_width?: Int32Array;
	tex_nchannel?: Int32Array;
	tex_adr?: Int32Array;
	tex_data?: Uint8Array;
	/** Older mujoco-js builds expose the blob as `tex_rgb` instead of `tex_data`. */
	tex_rgb?: Uint8Array;

	// Camera
	cam_mode?: Int32Array;
	cam_bodyid?: Int32Array;
	cam_pos?: Float64Array;
	cam_quat?: Float64Array;
	cam_fovy?: Float64Array;

	// Equality
	eq_type?: Int32Array;
	eq_obj1id?: Int32Array;
	eq_obj2id?: Int32Array;
	eq_active?: Uint8Array;
	eq_active0?: Uint8Array;

	// Mesh
	mesh_vertadr: Int32Array;
	mesh_vertnum: Int32Array;
	mesh_faceadr: Int32Array;
	mesh_facenum: Int32Array;
	mesh_vert: Float32Array;
	mesh_face: Int32Array;
	mesh_normal: Float32Array;
	/** Per-mesh start index into `mesh_normal` (1 per mesh). */
	mesh_normaladr?: Int32Array;
	/** Per-face normal indices, 3 per face (parallel to mesh_face). */
	mesh_facenormal?: Int32Array;
	/** Per-mesh start index into `mesh_texcoord` (1 per mesh). */
	mesh_texcoordadr?: Int32Array;
	/** Per-mesh number of texcoords (1 per mesh). */
	mesh_texcoordnum?: Int32Array;
	/** Flat UV array, 2 floats per texcoord. */
	mesh_texcoord?: Float32Array;
	/** Per-face texcoord indices, 3 per face (parallel to mesh_face). */
	mesh_facetexcoord?: Int32Array;

	// Visual globals (nested struct in C, flattened here; presence varies by mujoco-js build).
	vis?: {
		global?: {
			azimuth?: number;
			elevation?: number;
			fovy?: number;
			ipd?: number;
			offwidth?: number;
			offheight?: number;
			[key: string]: unknown;
		};
		headlight?: {
			ambient?: Float32Array;
			diffuse?: Float32Array;
			specular?: Float32Array;
			active?: number;
			[key: string]: unknown;
		};
		map?: {
			znear?: number;
			zfar?: number;
			fogstart?: number;
			fogend?: number;
			[key: string]: unknown;
		};
		quality?: {
			shadowsize?: number;
			offsamples?: number;
			[key: string]: unknown;
		};
		rgba?: {
			fog?: Float32Array;
			contactforce?: Float32Array;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};

	// Site
	site_bodyid: Int32Array;

	// Actuator
	actuator_trnid: Int32Array;
	actuator_ctrlrange: Float64Array;
	actuator_trntype: Int32Array;
	actuator_gainprm: Float64Array;
	actuator_biasprm: Float64Array;

	// Sensor
	sensor_type: Int32Array;
	sensor_dim: Int32Array;
	sensor_adr: Int32Array;
	sensor_objtype: Int32Array;
	sensor_objid: Int32Array;

	// Keyframe
	key_qpos: Float64Array;
	key_ctrl: Float64Array;
	key_time: Float64Array;
	key_qvel: Float64Array;

	// Light
	light_pos: Float64Array;
	light_dir: Float64Array;
	light_diffuse: Float32Array;
	light_specular: Float32Array;
	light_type: Int32Array;
	light_active: Uint8Array;
	light_castshadow: Uint8Array;
	light_attenuation: Float32Array;
	light_cutoff: Float32Array;
	light_exponent: Float32Array;
	light_intensity: Float32Array;
	light_bodyid?: Int32Array;
	light_ambient?: Float32Array;

	// Tendon
	ten_wrapadr: Int32Array;
	ten_wrapnum: Int32Array;
	ten_range: Float64Array;
	ten_rgba: Float32Array;
	ten_width: Float64Array;

	// Flex
	flex_vertadr: Int32Array;
	flex_vertnum: Int32Array;
	flex_faceadr: Int32Array;
	flex_facenum: Int32Array;
	flex_face: Int32Array;
	flex_rgba: Float32Array;

	// Model options
	opt: {
		timestep: number;
		gravity: Float64Array;
		integrator: number;
		[key: string]: unknown;
	};

	delete: () => void;
	[key: string]: unknown;
}

/**
 * Minimal interface for MuJoCo Data to avoid 'any'.
 */
export interface MujocoData {
	time: number;
	qpos: Float64Array;
	qvel: Float64Array;
	ctrl: Float64Array;
	act: Float64Array;
	xpos: Float64Array;
	xquat: Float64Array;
	xfrc_applied: Float64Array;
	qfrc_applied: Float64Array;
	qfrc_bias: Float64Array;
	site_xpos: Float64Array;
	site_xmat: Float64Array;
	/** World-frame COM positions per body (3 × nbody). */
	xipos?: Float64Array;
	/** World-frame camera positions (3 × ncam). */
	cam_xpos?: Float64Array;
	/** World-frame camera rotation matrices (9 × ncam). */
	cam_xmat?: Float64Array;
	sensordata: Float64Array;
	ncon: number;
	contact: MujocoContactArray;
	cvel: Float64Array;
	cfrc_ext: Float64Array;
	ten_length: Float64Array;
	wrap_xpos: Float64Array;
	ten_wrapadr: Int32Array;
	flexvert_xpos: Float64Array;
	geom_xpos: Float64Array;
	geom_xmat: Float64Array;
	delete: () => void;
	[key: string]: unknown;
}

/**
 * Minimal interface for the MuJoCo WASM Module.
 */
export interface MujocoModule {
	MjModel: { loadFromXML: (path: string) => MujocoModel; [key: string]: unknown };
	MjData: new (model: MujocoModel) => MujocoData;
	MjvOption: new () => { delete: () => void; [key: string]: unknown };
	mj_forward: (m: MujocoModel, d: MujocoData) => void;
	/** Tree walk only — fills xpos/xquat/geom_xpos/site_xpos without running
	 * dynamics or contacts. Used as a fallback when `mj_forward` crashes on
	 * degenerate geometry. */
	mj_kinematics: (m: MujocoModel, d: MujocoData) => void;
	mj_step: (m: MujocoModel, d: MujocoData) => void;
	mj_resetData: (m: MujocoModel, d: MujocoData) => void;
	mj_step1: (m: MujocoModel, d: MujocoData) => void;
	mj_step2: (m: MujocoModel, d: MujocoData) => void;
	mj_applyFT: (
		model: MujocoModel,
		data: MujocoData,
		force: Float64Array,
		torque: Float64Array,
		point: Float64Array,
		bodyId: number,
		qfrc_target: Float64Array
	) => void;
	mj_ray: (
		model: MujocoModel,
		data: MujocoData,
		pnt: Float64Array,
		vec: Float64Array,
		geomgroup: Uint8Array | null,
		flg_static: number,
		bodyexclude: number,
		geomid: Int32Array
	) => number;
	mj_name2id: (model: MujocoModel, type: number, name: string) => number;
	mjtObj: Record<string, number>;
	mjtGeom: Record<string, number | { value: number }>;
	mjtJoint: Record<string, number | { value: number }>;
	mjtSensor: Record<string, number | { value: number }>;
	FS: {
		writeFile: (path: string, content: string | Uint8Array) => void;
		readFile: (path: string, opts?: { encoding: string }) => string | Uint8Array;
		mkdir: (path: string) => void;
		unmount: (path: string) => void;
	};
	[key: string]: unknown;
}

// ---- Scene Configuration ----

export interface XmlPatch {
	target: string;
	inject?: string;
	injectAfter?: string;
	replace?: [string, string];
}

/**
 * Pluggable file reader. When provided, `loadScene` consults this function for
 * every XML / asset referenced by the scene instead of `fetch(src + path)`.
 *
 * The loader calls it with the MuJoCo-relative path (forward slashes). Return:
 * - a `string` for XML content,
 * - a `Uint8Array` for binary assets (meshes, textures),
 * - `null` / `undefined` to defer to the `src` URL fetch fallback, or
 * - throw to signal the file is unreachable (respects `onMissingAsset`).
 *
 * Used by host adapters (VSCode extension, File System Access API in the
 * browser debug app) to serve files directly from the user's disk.
 */
export type SceneFileLoader = (
	path: string
) => Promise<string | Uint8Array | null | undefined> | string | Uint8Array | null | undefined;

export interface SceneConfig {
	/** Base URL for fetching model files. The loader fetches `src + sceneFile` and follows dependencies. */
	src: string;
	/** Entry MJCF XML file name, e.g. 'scene.xml'. */
	sceneFile: string;
	homeJoints?: number[];
	xmlPatches?: XmlPatch[];
	onReset?: (model: MujocoModel, data: MujocoData) => void;
	/**
	 * How to handle asset files (meshes/textures) that return 404.
	 * - `'error'` (default): warn in the console but let MuJoCo's compiler fail if
	 *   the asset is actually referenced.
	 * - `'stub'`: write a tiny valid OBJ / 1×1 PNG placeholder so compilation
	 *   succeeds. Missing geometry renders as a degenerate point; missing
	 *   textures render as white. Useful for scenes with incomplete asset
	 *   bundles (e.g., ProcTHOR exports that reference an external cache).
	 */
	onMissingAsset?: 'stub' | 'error';
	/**
	 * Optional pluggable reader. When provided, consulted before falling back
	 * to `src` URL fetch for each file. Lets host adapters inject in-memory
	 * content (e.g., the VSCode editor's unsaved buffer for the root XML).
	 */
	fileLoader?: SceneFileLoader;
}

export interface SceneMarker {
	id: number;
	position: THREE.Vector3;
	label: string;
}

// ---- Callbacks ----

export type PhysicsStepCallback = (model: MujocoModel, data: MujocoData) => void;

// ---- State Management ----

export interface StateSnapshot {
	time: number;
	qpos: Float64Array;
	qvel: Float64Array;
	ctrl: Float64Array;
	act: Float64Array;
	qfrc_applied: Float64Array;
}

// ---- Model Introspection ----

export interface BodyInfo {
	id: number;
	name: string;
	mass: number;
	parentId: number;
}

export interface JointInfo {
	id: number;
	name: string;
	type: number;
	typeName: string;
	range: [number, number];
	limited: boolean;
	bodyId: number;
	qposAdr: number;
	dofAdr: number;
}

export interface GeomInfo {
	id: number;
	name: string;
	type: number;
	typeName: string;
	size: [number, number, number];
	bodyId: number;
}

export interface SiteInfo {
	id: number;
	name: string;
	bodyId: number;
}

export interface ActuatorInfo {
	id: number;
	name: string;
	range: [number, number];
}

export interface SensorInfo {
	id: number;
	name: string;
	type: number;
	typeName: string;
	dim: number;
	adr: number;
}

export interface CameraInfo {
	id: number;
	name: string;
	/** `mjtCamLight`: 0 fixed, 1 track, 2 trackcom, 3 targetbody, 4 targetbodycom */
	mode: number;
	bodyId: number;
	fovy: number;
}

export interface LightInfo {
	id: number;
	name: string;
	/** `mjtLightType`: 0 spot, 1 directional, 2 point */
	type: number;
	bodyId: number;
	active: boolean;
	castShadow: boolean;
}

export interface MaterialInfo {
	id: number;
	name: string;
	rgba: [number, number, number, number];
	emission: number;
	specular: number;
	shininess: number;
	reflectance: number;
	texId: number;
	texRepeat: [number, number];
	texUniform: boolean;
}

export interface TextureInfo {
	id: number;
	name: string;
	/** `mjtTexture`: 0 mjTEXTURE_2D, 1 mjTEXTURE_CUBE, 2 mjTEXTURE_SKYBOX */
	type: number;
	typeName: string;
	width: number;
	height: number;
	nchannel: number;
}

export interface MeshInfo {
	id: number;
	name: string;
	vertCount: number;
	faceCount: number;
}

export interface TendonInfo {
	id: number;
	name: string;
	range: [number, number];
	width: number;
	rgba: [number, number, number, number];
	wrapCount: number;
}

export interface EqualityInfo {
	id: number;
	name: string;
	/** `mjtEq`: 0 connect, 1 weld, 2 joint, 3 tendon, 4 flex */
	type: number;
	typeName: string;
	obj1Id: number;
	obj2Id: number;
	active: boolean;
}

// ---- Selection ----

export type EntityKind =
	| 'body'
	| 'joint'
	| 'geom'
	| 'site'
	| 'camera'
	| 'light'
	| 'material'
	| 'texture'
	| 'mesh'
	| 'tendon'
	| 'actuator'
	| 'sensor'
	| 'equality'
	| 'keyframe';

export interface Selection {
	kind: EntityKind;
	id: number;
}

/** Keyframes are identified by id + name — there's no full `KeyframeInfo` like
 * other entities. `SelectedInfo` uses this shape to keep the discriminated
 * union uniform. */
export interface KeyframeInfo {
	id: number;
	name: string;
}

/**
 * Per-kind discriminated union of the resolved info record for the current
 * selection. Narrowing on `info.kind` gives you the exact `*Info` type for
 * the selected entity — no manual casts or `as unknown` tricks.
 *
 * ```ts
 * const sel = sim.selectedInfo;
 * if (sel?.kind === 'body') {
 *   sel.info.mass; // BodyInfo
 * }
 * ```
 */
export type SelectedInfo =
	| { kind: 'body'; info: BodyInfo }
	| { kind: 'joint'; info: JointInfo }
	| { kind: 'geom'; info: GeomInfo }
	| { kind: 'site'; info: SiteInfo }
	| { kind: 'camera'; info: CameraInfo }
	| { kind: 'light'; info: LightInfo }
	| { kind: 'material'; info: MaterialInfo }
	| { kind: 'texture'; info: TextureInfo }
	| { kind: 'mesh'; info: MeshInfo }
	| { kind: 'tendon'; info: TendonInfo }
	| { kind: 'actuator'; info: ActuatorInfo }
	| { kind: 'sensor'; info: SensorInfo }
	| { kind: 'equality'; info: EqualityInfo }
	| { kind: 'keyframe'; info: KeyframeInfo };

// ---- Contacts ----

export interface ContactInfo {
	geom1: number;
	geom1Name: string;
	geom2: number;
	geom2Name: string;
	pos: [number, number, number];
	depth: number;
}

// ---- Raycast ----

export interface RayHit {
	point: THREE.Vector3;
	bodyId: number;
	geomId: number;
	distance: number;
}

// ---- Trajectory ----

export interface TrajectoryFrame {
	time: number;
	qpos: Float64Array;
	qvel?: Float64Array;
	ctrl?: Float64Array;
	sensordata?: Float64Array;
}

export interface TrajectoryData {
	frames: TrajectoryFrame[];
	fps: number;
}

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'completed';

// ---- Keyboard Teleop ----

export interface KeyBinding {
	actuator: Actuators;
	delta?: number;
	toggle?: [number, number];
	set?: number;
}

export interface KeyboardTeleopOptions {
	bindings: Record<string, KeyBinding>;
	enabled?: boolean;
}

// ---- Policy ----

export interface PolicyOptions {
	frequency: number;
	onObservation: (model: MujocoModel, data: MujocoData) => Float32Array | Float64Array | number[];
	onAction: (
		action: Float32Array | Float64Array | number[],
		model: MujocoModel,
		data: MujocoData
	) => void;
}

// ---- Component Props ----

export interface DragInteractionProps {
	stiffness?: number;
	showArrow?: boolean;
}

export type TrajectoryInput = TrajectoryFrame[] | number[][];

// ---- Public API ----

/**
 * Imperative simulation handle exposed by `<MujocoPhysics>` / `<MujocoCanvas>`
 * via `bind:api`.
 *
 * Reactive state (`paused`, `speed`, `time`, `selectedBodyId`, `status`) is
 * not on this object — bind those directly on the component, or read them
 * from the sim context via `useMujocoContext()` / `useMujoco()`.
 *
 * Introspection arrays (`bodies`, `joints`, `geoms`, `sites`, `actuators`,
 * `sensors`, `keyframes`) also live on the sim context as reactive getters,
 * not here.
 *
 * Canvas helpers (raycast, 2D→3D projection) are separate hooks: `useRaycast`.
 */
export interface MujocoSimAPI {
	// Lifecycle.
	reset(): Promise<void>;
	step(n?: number): void;
	applyKeyframe(nameOrIndex: Keyframes | number): Promise<void>;
	loadScene(newConfig: SceneConfig): Promise<void>;

	// Snapshot / restore
	saveState(): Promise<StateSnapshot> | StateSnapshot;
	restoreState(snapshot: StateSnapshot): void;

	// Low-level state I/O — allocate, so stay as methods rather than getters.
	setQpos(values: Float64Array | number[]): void;
	setQvel(values: Float64Array | number[]): void;
	getQpos(): Float64Array;
	getQvel(): Float64Array;
	setCtrl(nameOrValues: Actuators | Record<Actuators, number>, value?: number): void;
	getCtrl(): Float64Array;

	// Forces
	applyForce(bodyName: Bodies, force: THREE.Vector3, point?: THREE.Vector3): void;
	applyTorque(bodyName: Bodies, torque: THREE.Vector3): void;
	setExternalForce(bodyName: Bodies, force: THREE.Vector3, torque: THREE.Vector3): void;
	applyGeneralizedForce(values: Float64Array | number[]): void;

	// Reads
	getSensorData(name: Sensors): Float64Array | null;
	getContacts(): ContactInfo[];

	// Domain randomization
	setBodyMass(name: Bodies, mass: number): void;
	setGeomFriction(name: Geoms, friction: [number, number, number]): void;
	setGeomSize(name: Geoms, size: [number, number, number]): void;
}

// ---- Canvas Props ----

export interface MujocoCanvasProps {
	config: SceneConfig;
	onReady?: (api: MujocoSimAPI) => void;
	onError?: (error: Error) => void;
	onStep?: (time: number) => void;
	onSelection?: (bodyId: number, name: string) => void;
	// Declarative physics config
	gravity?: [number, number, number];
	timestep?: number;
	substeps?: number;
	paused?: boolean;
	speed?: number;
	/** Two-way bound — reflects body double-click selections (via `bind:selectedBodyId`). */
	selectedBodyId?: number | null;
	// Camera helpers (forwarded to Threlte <Canvas>)
	camera?: {
		position?: [number, number, number];
		up?: [number, number, number];
		fov?: number;
		near?: number;
		far?: number;
	};
	shadows?: boolean;
	class?: string;
	style?: string;
	children?: Snippet;
	/** Bound to the resolved API once the sim is ready. */
	api?: MujocoSimAPI | null;
}

// ---- Hook Return Types ----

export interface SitePositionHandle {
	readonly position: THREE.Vector3;
	readonly quaternion: THREE.Quaternion;
}

export interface CtrlHandle {
	/** Read the current ctrl value. */
	read(): number;
	/** Write a ctrl value (goes directly to data.ctrl). */
	write(value: number): void;
	/** Actuator name. */
	name: Actuators;
	/** Actuator control range [min, max]. */
	range: [number, number];
}

export interface SensorHandle {
	/** Read the current sensor data. */
	read(): Float64Array;
	/** Sensor dimensionality. */
	dim: number;
	/** Sensor name. */
	name: Sensors;
}

export interface BodyStateHandle {
	readonly position: THREE.Vector3;
	readonly quaternion: THREE.Quaternion;
	readonly linearVelocity: THREE.Vector3;
	readonly angularVelocity: THREE.Vector3;
}

export interface JointStateHandle {
	readonly position: number | Float64Array;
	readonly velocity: number | Float64Array;
}
