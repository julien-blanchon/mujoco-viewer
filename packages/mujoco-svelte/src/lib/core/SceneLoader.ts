/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
	MujocoData,
	MujocoModel,
	MujocoModule,
	SceneConfig,
	SceneFileLoader,
	XmlPatch
} from '../types.js';

/**
 * Reads a null-terminated C string from MuJoCo's WASM memory.
 */
export function getName(mjModel: MujocoModel, address: number): string {
	let name = '';
	let idx = address;
	let safety = 0;
	while (mjModel.names[idx] !== 0 && safety < 100) {
		name += String.fromCharCode(mjModel.names[idx++]);
		safety++;
	}
	return name;
}

/**
 * Find a site by name in the MuJoCo model. Returns -1 if not found.
 */
export function findSiteByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.nsite; i++) {
		if (getName(mjModel, mjModel.name_siteadr[i]).includes(name)) return i;
	}
	return -1;
}

/**
 * Find an actuator by name in the MuJoCo model. Returns -1 if not found.
 */
export function findActuatorByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.nu; i++) {
		if (getName(mjModel, mjModel.name_actuatoradr[i]).includes(name)) return i;
	}
	return -1;
}

/**
 * Find a keyframe by name in the MuJoCo model. Returns -1 if not found.
 */
export function findKeyframeByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.nkey; i++) {
		if (getName(mjModel, mjModel.name_keyadr[i]) === name) return i;
	}
	return -1;
}

/**
 * Find a body by name in the MuJoCo model. Returns -1 if not found.
 */
export function findBodyByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.nbody; i++) {
		if (getName(mjModel, mjModel.name_bodyadr[i]) === name) return i;
	}
	return -1;
}

/**
 * Find a joint by name in the MuJoCo model. Returns -1 if not found.
 */
export function findJointByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.njnt; i++) {
		if (getName(mjModel, mjModel.name_jntadr[i]) === name) return i;
	}
	return -1;
}

/**
 * Find a geom by name in the MuJoCo model. Returns -1 if not found.
 */
export function findGeomByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.ngeom; i++) {
		if (getName(mjModel, mjModel.name_geomadr[i]) === name) return i;
	}
	return -1;
}

/**
 * Find a sensor by name in the MuJoCo model. Returns -1 if not found.
 */
export function findSensorByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < mjModel.nsensor; i++) {
		if (getName(mjModel, mjModel.name_sensoradr[i]) === name) return i;
	}
	return -1;
}

/**
 * Find a tendon by name in the MuJoCo model. Returns -1 if not found.
 */
export function findTendonByName(mjModel: MujocoModel, name: string): number {
	for (let i = 0; i < (mjModel.ntendon ?? 0); i++) {
		if (getName(mjModel, mjModel.name_tendonadr[i]) === name) return i;
	}
	return -1;
}

/**
 * Return qpos address for actuators that directly target a scalar joint.
 * Returns -1 for non-joint transmissions and multi-DOF joints.
 */
export function getActuatedScalarQposAdr(mjModel: MujocoModel, actuatorId: number): number {
	if (actuatorId < 0 || actuatorId >= mjModel.nu) return -1;

	// mjTRN_JOINT=0, mjTRN_JOINTINPARENT=1. Other transmission types don't map ctrl to a single qpos.
	const trnType = mjModel.actuator_trntype?.[actuatorId];
	if (trnType !== undefined && trnType !== 0 && trnType !== 1) return -1;

	const jointId = mjModel.actuator_trnid[2 * actuatorId];
	if (jointId < 0 || jointId >= mjModel.njnt) return -1;

	const jntType = mjModel.jnt_type[jointId];
	if (jntType !== 2 && jntType !== 3) return -1; // slide=2, hinge=3

	return mjModel.jnt_qposadr[jointId];
}

/** Pick a stub payload by file extension. */
function stubForPath(fname: string): Uint8Array {
	const lower = fname.toLowerCase();
	if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
		return STUB_PNG;
	}
	if (lower.endsWith('.stl')) return STUB_STL;
	return STUB_OBJ;
}

/**
 * Turn an Embind / C++ exception from MuJoCo into a readable message.
 *
 * Emscripten-compiled code throws exceptions in a few shapes:
 *   - raw integer pointer (legacy mode)
 *   - `CppException` object with an `excPtr` field (wasm-exceptions mode)
 *   - ordinary `Error` objects for runtime faults like `std::bad_alloc`
 *
 * We try `Module.getExceptionMessage(ptr)` for the first two, and also drain
 * the module's captured stderr (set up by `MujocoWasmState`) — MuJoCo logs
 * the real detail there when it's available.
 */
function resolveMuJoCoError(
	mujoco: MujocoModule,
	e: unknown,
	sceneFile: string
): string {
	const parts: string[] = [];

	const getMsg = (mujoco as unknown as {
		getExceptionMessage?: (ptr: unknown) => [string, string | null];
	}).getExceptionMessage;
	if (typeof getMsg === 'function') {
		const ptr =
			typeof e === 'number'
				? e
				: e && typeof e === 'object' && typeof (e as { excPtr?: number }).excPtr === 'number'
					? (e as { excPtr: number }).excPtr
					: null;
		if (ptr !== null) {
			try {
				const [type, message] = getMsg(ptr);
				const label = [type, message].filter(Boolean).join(': ');
				if (label) parts.push(label);
			} catch {
				/* fall through */
			}
		}
	}

	const drain = (mujoco as unknown as { __drainStderr?: () => string }).__drainStderr;
	if (typeof drain === 'function') {
		const stderr = drain();
		if (stderr) parts.push(stderr);
	}

	if (parts.length === 0) {
		if (e instanceof Error && e.message) parts.push(e.message);
		else parts.push(typeof e === 'number' ? `exception pointer ${e}` : String(e));
	}

	// Heuristics. These are imperfect but point users at the likely cause
	// instead of leaving them staring at "mjXError".
	const combined = parts.join('\n');
	if (/bad_alloc|out of memory/i.test(combined)) {
		parts.push(
			'(WASM heap-size limit. The default mujoco-js build is too small for very large scenes. Reduce the number of textures / meshes, or rebuild mujoco-js with a larger INITIAL_MEMORY.)'
		);
	} else if (/^mj[XC]Error$/.test(combined) || parts.length === 0) {
		// MuJoCo threw without a message (Embind dropped it). Most common cause:
		// asset count or total texture memory exceeded the WASM heap, surfaced
		// as a no-detail XML / compile error.
		parts.push(
			'(MuJoCo reported an error without a message — the mujoco-js WASM build does not expose the detail. Most common causes: (a) missing / corrupt asset file, (b) WASM heap exhausted on a large scene. Try a smaller scene or a mujoco-js build with a larger INITIAL_MEMORY.)'
		);
	}

	return `MuJoCo failed to load ${sceneFile}: ${parts.join('\n')}`;
}

/** Create virtual directory structure for a file path. */
function ensureDir(mujoco: MujocoModule, fname: string) {
	const dirParts = fname.split('/');
	dirParts.pop();
	let currentPath = '/working';
	for (const part of dirParts) {
		currentPath += '/' + part;
		try {
			mujoco.FS.mkdir(currentPath);
		} catch {
			/* ignore */
		}
	}
}

interface LoadResult {
	mjModel: MujocoModel;
	mjData: MujocoData;
	/**
	 * Final post-patch XML text of the main scene file (after scene object
	 * injection + xmlPatches applied). Useful for the XML viewer and as the
	 * starting point for in-place XML edits via `engine.reloadFromXml`.
	 */
	xml: string;
	/**
	 * Post-patch XML text for every XML file that was downloaded during the
	 * load — the main scene plus every `<include>`d file (including transitive
	 * ones). Keys are the MuJoCo-relative paths used on the virtual FS
	 * (matching `/working/<path>`). The main scene text appears under
	 * `config.sceneFile`.
	 *
	 * Consumers use this to edit include-file entities without losing the
	 * post-patch content. Pair with `engine.reloadFromFiles` to write edits
	 * back and recompile.
	 */
	xmlFiles: Map<string, string>;
}

/**
 * Fetch a single file, going through the user-provided loader first and
 * falling back to HTTP `fetch(baseUrl + path)` only if the loader declines
 * (returns `null` / `undefined`). Returns null on HTTP failure so the caller
 * can decide whether to stub or warn.
 */
async function readText(
	loader: SceneFileLoader | undefined,
	baseUrl: string,
	path: string
): Promise<string | null> {
	if (loader) {
		const hit = await loader(path);
		if (typeof hit === 'string') return hit;
		if (hit instanceof Uint8Array) return new TextDecoder().decode(hit);
	}
	const res = await fetch(baseUrl + path);
	if (!res.ok) {
		console.warn(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
		return null;
	}
	return res.text();
}

async function readBinary(
	loader: SceneFileLoader | undefined,
	baseUrl: string,
	path: string
): Promise<Uint8Array | null> {
	if (loader) {
		const hit = await loader(path);
		if (hit instanceof Uint8Array) return hit;
		if (typeof hit === 'string') return new TextEncoder().encode(hit);
	}
	const res = await fetch(baseUrl + path);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ${res.statusText}`);
	}
	return new Uint8Array(await res.arrayBuffer());
}

// Minimal valid OBJ (a single degenerate triangle at the origin). MuJoCo's
// parser requires at least one face to consider the mesh well-formed.
const STUB_OBJ = new TextEncoder().encode('v 0 0 0\nv 0 0 0\nv 0 0 0\nf 1 2 3\n');
// Minimal valid binary STL: 80-byte header + uint32 triangle count = 1 + one
// degenerate triangle (50 bytes: 12 floats + 1 uint16 attr).
const STUB_STL = (() => {
	const buf = new ArrayBuffer(84 + 50);
	const view = new DataView(buf);
	view.setUint32(80, 1, true); // little-endian: 1 triangle
	// All 12 floats left as zero = degenerate triangle at the origin.
	return new Uint8Array(buf);
})();
// 1×1 transparent PNG — smallest valid PNG we can ship.
const STUB_PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82
]);

/**
 * Config-driven scene loader — replaces the old RobotLoader + patchSingleRobot approach.
 */
export async function loadScene(
	mujoco: MujocoModule,
	config: SceneConfig,
	onProgress?: (msg: string) => void
): Promise<LoadResult> {
	// 1. Clean up virtual filesystem
	try {
		mujoco.FS.unmount('/working');
	} catch {
		/* ignore */
	}
	try {
		mujoco.FS.mkdir('/working');
	} catch {
		/* ignore */
	}

	const baseUrl = config.src.endsWith('/') ? config.src : config.src + '/';

	const downloaded = new Set<string>();
	const xmlQueue: string[] = [config.sceneFile];
	const assetFiles: string[] = [];
	let mainSceneXml = '';
	// Retain the post-patch text of every downloaded XML file (main + all
	// <include>d files). Needed by the editor pipeline so edits to entities
	// defined in include files can splice the right file instead of losing
	// their post-patch content.
	const xmlFiles = new Map<string, string>();

	// 2a. Download XML files sequentially (to discover dependencies)
	while (xmlQueue.length > 0) {
		const fname = xmlQueue.shift()!;
		if (downloaded.has(fname)) continue;
		downloaded.add(fname);

		if (!fname.endsWith('.xml')) {
			// Non-XML discovered during XML scan — collect for parallel download
			assetFiles.push(fname);
			continue;
		}

		onProgress?.(`Downloading ${fname}...`);

		const loaded = await readText(config.fileLoader, baseUrl, fname);
		if (loaded === null) continue;
		let text = loaded;

		// 3. Apply XML patches from config
		for (const patch of config.xmlPatches ?? []) {
			if (fname.endsWith(patch.target) || fname === patch.target) {
				if (patch.replace) {
					const [from, to] = patch.replace;
					if (text.includes(from)) {
						text = text.replace(from, to);
					} else {
						const preview = from.length > 80 ? `${from.slice(0, 80)}...` : from;
						console.warn(`XML patch replace pattern not found in ${fname}: "${preview}"`);
					}
				}
				if (patch.inject && patch.injectAfter) {
					const idx = text.indexOf(patch.injectAfter);
					if (idx !== -1) {
						const tagEnd = text.indexOf('>', idx + patch.injectAfter.length);
						if (tagEnd !== -1) {
							text = text.slice(0, tagEnd + 1) + patch.inject + text.slice(tagEnd + 1);
						} else {
							console.warn(
								`XML patch inject failed in ${fname}: could not find tag end after "${patch.injectAfter}"`
							);
						}
					} else {
						const preview =
							patch.injectAfter.length > 80
								? `${patch.injectAfter.slice(0, 80)}...`
								: patch.injectAfter;
						console.warn(`XML patch inject anchor not found in ${fname}: "${preview}"`);
					}
				}
			}
		}

		if (fname === config.sceneFile) mainSceneXml = text;
		xmlFiles.set(fname, text);

		ensureDir(mujoco, fname);
		mujoco.FS.writeFile(`/working/${fname}`, text);
		scanDependencies(text, fname, downloaded, xmlQueue);
	}

	// 2b. Download all binary assets (meshes, textures). We pool fetches so
	// browsers don't raise `net::ERR_INSUFFICIENT_RESOURCES` on scenes with
	// thousands of references (ProcTHOR, etc.). Missing assets are either
	// skipped (default) or replaced with a tiny stub so `mj_loadXML` doesn't
	// bail — controlled by `config.onMissingAsset`.
	if (assetFiles.length > 0) {
		const fallback = config.onMissingAsset ?? 'error';
		let done = 0;
		let missing = 0;
		const total = assetFiles.length;
		const results: Array<{ fname: string; buffer: Uint8Array } | null> = new Array(total).fill(null);
		onProgress?.(`Downloading 0 / ${total} assets…`);

		const concurrency = Math.min(32, total);
		let cursor = 0;
		const progressStep = Math.max(1, Math.floor(total / 50));

		async function worker() {
			while (true) {
				const i = cursor++;
				if (i >= total) break;
				const fname = assetFiles[i];
				let buffer: Uint8Array | null = null;
				try {
					buffer = await readBinary(config.fileLoader, baseUrl, fname);
				} catch (e) {
					if (fallback === 'stub') {
						buffer = stubForPath(fname);
						missing++;
					} else {
						console.warn(`Failed to fetch ${fname}:`, e);
					}
				}
				results[i] = buffer ? { fname, buffer } : null;
				done++;
				if (done === total || done % progressStep === 0) {
					onProgress?.(`Downloading ${done} / ${total} assets…`);
				}
			}
		}

		await Promise.all(Array.from({ length: concurrency }, () => worker()));

		for (const result of results) {
			if (!result) continue;
			ensureDir(mujoco, result.fname);
			mujoco.FS.writeFile(`/working/${result.fname}`, result.buffer);
		}

		if (missing > 0) {
			onProgress?.(`Stubbed ${missing} / ${total} missing assets`);
			console.warn(
				`[mujoco-svelte] ${missing} asset(s) were unreachable; stubbed (onMissingAsset: 'stub').`
			);
		}
	}

	// 5. Load model. MuJoCo is an Embind-compiled WASM module; compile errors
	// get thrown as raw integer pointers. Extract the C++ exception message
	// so callers see something better than "0" / "Unknown error".
	onProgress?.('Loading model...');
	let mjModel: MujocoModel;
	let mjData: MujocoData;
	try {
		mjModel = mujoco.MjModel.loadFromXML(`/working/${config.sceneFile}`);
		mjData = new mujoco.MjData(mjModel);
	} catch (e) {
		throw new Error(resolveMuJoCoError(mujoco, e, config.sceneFile));
	}

	// 6. Set initial pose — set both ctrl and qpos so robot starts at home.
	//    If homeJoints is not provided, keep raw MuJoCo defaults.
	if (config.homeJoints) {
		const homeCount = Math.min(config.homeJoints.length, mjModel.nu);
		for (let i = 0; i < homeCount; i++) {
			mjData.ctrl[i] = config.homeJoints[i];
			const qposAdr = getActuatedScalarQposAdr(mjModel, i);
			if (qposAdr !== -1) {
				mjData.qpos[qposAdr] = config.homeJoints[i];
			}
		}
	}

	// `mj_forward` runs the full pipeline (kinematics + dynamics + constraints +
	// contacts). On scenes with degenerate geometry it can throw a WASM
	// "out of bounds" fault. We still want the viewer to render the model, so
	// fall back to `mj_kinematics` — that just walks the tree and fills in
	// `xpos`/`xquat`/`geom_xpos`/`site_xpos`, which is enough for rendering.
	try {
		mujoco.mj_forward(mjModel, mjData);
	} catch (e) {
		console.warn(
			'[mujoco-svelte] mj_forward crashed on initial load; falling back to mj_kinematics. Physics stepping will likely crash for this scene until the offending geometry is fixed.',
			e
		);
		try {
			mujoco.mj_kinematics(mjModel, mjData);
		} catch (e2) {
			console.error('[mujoco-svelte] mj_kinematics also failed', e2);
		}
	}

	return { mjModel, mjData, xml: mainSceneXml, xmlFiles };
}

/**
 * Reload a model by overwriting one or more XML files on the virtual FS and
 * recompiling the main scene. Assets from the original `loadScene` stay
 * mounted; only the files whose text changed are rewritten.
 *
 * Use for edit-session commits that span multiple files — e.g. editing a body
 * defined in `hand.xml` when the scene file is `scene_right.xml`. The scene
 * file is the compile entry point even if the actual edit landed in an
 * `<include>`d file.
 */
export function loadFromFiles(
	mujoco: MujocoModule,
	sceneFile: string,
	files: Map<string, string>
): { mjModel: MujocoModel; mjData: MujocoData; xml: string; xmlFiles: Map<string, string> } {
	for (const [fname, text] of files) {
		ensureDir(mujoco, fname);
		mujoco.FS.writeFile(`/working/${fname}`, text);
	}
	let mjModel: MujocoModel;
	let mjData: MujocoData;
	try {
		mjModel = mujoco.MjModel.loadFromXML(`/working/${sceneFile}`);
		mjData = new mujoco.MjData(mjModel);
	} catch (e) {
		throw new Error(resolveMuJoCoError(mujoco, e, sceneFile));
	}
	try {
		mujoco.mj_forward(mjModel, mjData);
	} catch {
		try {
			mujoco.mj_kinematics(mjModel, mjData);
		} catch {
			/* ignore */
		}
	}
	const mainXml = files.get(sceneFile) ?? '';
	return { mjModel, mjData, xml: mainXml, xmlFiles: new Map(files) };
}

/**
 * Reload the main scene from an edited XML string. Back-compat wrapper over
 * `loadFromFiles` — only the main scene file is overwritten; any `<include>`d
 * files on the FS keep their previous content.
 */
export function loadFromXmlString(
	mujoco: MujocoModule,
	sceneFile: string,
	xml: string
): { mjModel: MujocoModel; mjData: MujocoData; xml: string; xmlFiles: Map<string, string> } {
	return loadFromFiles(mujoco, sceneFile, new Map([[sceneFile, xml]]));
}

/** Extract an attribute value out of a tag's attribute list (regex-based). */
function extractAttr(attrBlob: string, name: string): string | null {
	const m = attrBlob.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`));
	return m ? m[1] : null;
}

/** Normalize `a/b/../c` → `a/c` in a MuJoCo relative file path. */
function normalizePath(input: string): string {
	const parts = input.replace(/\/\//g, '/').split('/');
	const norm: string[] = [];
	for (const p of parts) {
		if (p === '..') norm.pop();
		else if (p !== '.') norm.push(p);
	}
	return norm.join('/');
}

/**
 * Scan XML for file dependencies (meshes, textures, includes).
 *
 * Uses regex instead of `DOMParser` so this works in Web Worker contexts too,
 * where `DOMParser` is not available. MuJoCo XML is simple enough for this to
 * be robust — we only look at the `<compiler>` tag's directory attributes and
 * any element with a `file=` attribute.
 */
function scanDependencies(
	xmlString: string,
	currentFile: string,
	downloaded: Set<string>,
	queue: string[]
) {
	// Find the <compiler ...> tag (first match) and pull out its directory attrs.
	const compilerMatch = xmlString.match(/<compiler\b([^>]*)/);
	const compilerAttrs = compilerMatch ? compilerMatch[1] : '';
	const assetDir = extractAttr(compilerAttrs, 'assetdir') ?? '';
	const meshDir = extractAttr(compilerAttrs, 'meshdir') ?? assetDir;
	const textureDir = extractAttr(compilerAttrs, 'texturedir') ?? assetDir;
	const currentDir = currentFile.includes('/')
		? currentFile.substring(0, currentFile.lastIndexOf('/') + 1)
		: '';

	// Match any tag that has a `file="..."` attribute. Capture (tagName, fileValue).
	// Non-greedy attribute blob lets us tolerate attributes before `file=`.
	const tagFileRe = /<([a-zA-Z_][\w-]*)\b[^>]*?\bfile\s*=\s*["']([^"']+)["']/g;
	let m: RegExpExecArray | null;
	while ((m = tagFileRe.exec(xmlString)) !== null) {
		const tagName = m[1].toLowerCase();
		const fileAttr = m[2];

		let prefix = '';
		if (tagName === 'mesh') prefix = meshDir ? meshDir + '/' : '';
		else if (tagName === 'texture' || tagName === 'hfield')
			prefix = textureDir ? textureDir + '/' : '';

		const fullPath = normalizePath(currentDir + prefix + fileAttr);
		if (!downloaded.has(fullPath)) queue.push(fullPath);
	}
}
