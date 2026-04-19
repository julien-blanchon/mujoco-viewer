/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TextureDecoder
 *
 * Converts MuJoCo texture records (`mat_texid` → `tex_*` arrays in the model)
 * into Three.js textures. Handles the three `mjtTexture` kinds:
 *
 *   - `mjTEXTURE_2D`      (0) → `THREE.DataTexture`
 *   - `mjTEXTURE_CUBE`    (1) → `THREE.CubeTexture` (6 faces stacked vertically)
 *   - `mjTEXTURE_SKYBOX`  (2) → `THREE.CubeTexture` (same layout, used as scene.background)
 *
 * Built-in procedural textures (checker / flat / gradient) are baked into
 * `tex_data` by MuJoCo's compiler, so we just decode the bytes uniformly —
 * no separate procedural codepath needed.
 */

import * as THREE from 'three';
import type { MujocoModel } from '../types.js';

const MJ_TEX = {
	TWODIM: 0,
	CUBE: 1,
	SKYBOX: 2
} as const;

/** Pick whichever blob the active mujoco-js build exposes. */
function texBlob(model: MujocoModel): Uint8Array | null {
	return model.tex_data ?? model.tex_rgb ?? null;
}

/** Extract a single rectangular RGB(A)-or-L byte slice from `tex_data`. */
function slice(
	blob: Uint8Array,
	offset: number,
	byteLength: number
): Uint8Array {
	return blob.subarray(offset, offset + byteLength);
}

/**
 * Expand any MuJoCo pixel layout (L / RGB / RGBA) into tightly packed RGBA.
 * Three.js WebGL2 backend no longer accepts `RGBFormat` for sRGB-encoded
 * textures; RGBA is the only safe output format.
 */
function toRGBA(pixels: Uint8Array, nchannel: number): Uint8Array {
	if (nchannel === 4) return pixels;
	if (nchannel === 3) {
		const n = pixels.length / 3;
		const out = new Uint8Array(n * 4);
		for (let i = 0; i < n; i++) {
			out[i * 4] = pixels[i * 3];
			out[i * 4 + 1] = pixels[i * 3 + 1];
			out[i * 4 + 2] = pixels[i * 3 + 2];
			out[i * 4 + 3] = 255;
		}
		return out;
	}
	if (nchannel === 1) {
		const n = pixels.length;
		const out = new Uint8Array(n * 4);
		for (let i = 0; i < n; i++) {
			out[i * 4] = pixels[i];
			out[i * 4 + 1] = pixels[i];
			out[i * 4 + 2] = pixels[i];
			out[i * 4 + 3] = 255;
		}
		return out;
	}
	// Unknown channel count — return as-is; caller will likely see a GL error.
	return pixels;
}

/** Decode a 2D texture by id. Returns null if the texture isn't 2D or the model lacks the blob. */
export function decode2D(
	model: MujocoModel,
	id: number
): THREE.DataTexture | null {
	if (!model.tex_type || !model.tex_width || !model.tex_height) return null;
	if (id < 0 || id >= model.ntex) return null;
	if (model.tex_type[id] !== MJ_TEX.TWODIM) return null;

	const blob = texBlob(model);
	if (!blob) return null;

	const w = model.tex_width[id];
	const h = model.tex_height[id];
	const nchannel = model.tex_nchannel?.[id] ?? 3;
	const offset = model.tex_adr?.[id] ?? 0;
	const byteLength = w * h * nchannel;
	if (offset + byteLength > blob.length) return null;

	const pixels = toRGBA(slice(blob, offset, byteLength), nchannel);
	const tex = new THREE.DataTexture(
		pixels,
		w,
		h,
		THREE.RGBAFormat,
		THREE.UnsignedByteType
	);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipMapLinearFilter;
	tex.generateMipmaps = true;
	// MuJoCo stores textures top-row-first; Three.js upload expects bottom-row-first for Y flip.
	tex.flipY = true;
	tex.needsUpdate = true;
	return tex;
}

/**
 * Paint an RGBA byte buffer into a fresh `<canvas>`. Three.js's
 * `uploadCubeTexture` only hits the stable `texSubImage2D(image-source)` path
 * when the face images are HTMLImage/HTMLCanvas — raw data images go through
 * a different branch that throws `error2 is not a function` on many drivers.
 */
function pixelsToCanvas(rgba: Uint8Array, w: number, h: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	const imgData = ctx.createImageData(w, h);
	// `ImageData.data` is Uint8ClampedArray; copy byte-wise for safety.
	imgData.data.set(rgba);
	ctx.putImageData(imgData, 0, 0);
	return canvas;
}

/**
 * Decode a cube/skybox texture. MuJoCo packs the six faces vertically:
 * the blob is `width × (height * 6)` with face order right, left, up, down, front, back
 * (matching OpenGL's GL_TEXTURE_CUBE_MAP_POSITIVE_X…NEGATIVE_Z order).
 */
export function decodeCube(model: MujocoModel, id: number): THREE.CubeTexture | null {
	if (!model.tex_type || !model.tex_width || !model.tex_height) return null;
	if (id < 0 || id >= model.ntex) return null;
	const kind = model.tex_type[id];
	if (kind !== MJ_TEX.CUBE && kind !== MJ_TEX.SKYBOX) return null;

	const blob = texBlob(model);
	if (!blob) return null;

	const faceSize = model.tex_width[id];
	// For cube/skybox, `tex_height` is the stacked height (6 × faceSize).
	// The blob is 6 * faceSize * faceSize * nchannel bytes.
	const nchannel = model.tex_nchannel?.[id] ?? 3;
	if (!faceSize || nchannel <= 0) return null;
	const faceBytes = faceSize * faceSize * nchannel;
	const offset = model.tex_adr?.[id] ?? 0;
	if (offset + faceBytes * 6 > blob.length) return null;

	const canvases: HTMLCanvasElement[] = [];
	for (let f = 0; f < 6; f++) {
		const pixels = toRGBA(slice(blob, offset + f * faceBytes, faceBytes), nchannel);
		canvases.push(pixelsToCanvas(pixels, faceSize, faceSize));
	}

	const cube = new THREE.CubeTexture();
	// Canvas elements are the right shape for THREE.CubeTexture.images. No cast
	// needed, no raw-data branch — works on every WebGL driver.
	cube.images = canvases as unknown as HTMLImageElement[];
	cube.format = THREE.RGBAFormat;
	cube.type = THREE.UnsignedByteType;
	cube.colorSpace = THREE.SRGBColorSpace;
	cube.magFilter = THREE.LinearFilter;
	cube.minFilter = THREE.LinearFilter;
	cube.generateMipmaps = false;
	cube.needsUpdate = true;
	return cube;
}

/** Find the first SKYBOX texture in the model and decode it. */
export function decodeSkybox(model: MujocoModel): THREE.CubeTexture | null {
	if (!model.tex_type || !model.ntex) return null;
	for (let i = 0; i < model.ntex; i++) {
		if (model.tex_type[i] === MJ_TEX.SKYBOX) return decodeCube(model, i);
	}
	return null;
}

/**
 * Decode any texture by id — dispatches on type. The 2D branch returns a flat
 * `THREE.Texture`; the cube / skybox branches return `THREE.CubeTexture`.
 */
export function decodeTexture(
	model: MujocoModel,
	id: number
): THREE.Texture | THREE.CubeTexture | null {
	if (!model.tex_type || id < 0 || id >= model.ntex) return null;
	const kind = model.tex_type[id];
	if (kind === MJ_TEX.TWODIM) return decode2D(model, id);
	return decodeCube(model, id);
}

/**
 * Cache that decodes each texture once per model and disposes everything on
 * reset. Use inside a component's lifecycle: `cache.get(id)` on demand,
 * `cache.dispose()` in teardown.
 */
export class TextureCache {
	#entries = new Map<number, THREE.Texture | THREE.CubeTexture>();
	#model: MujocoModel;

	constructor(model: MujocoModel) {
		this.#model = model;
	}

	get(id: number): THREE.Texture | THREE.CubeTexture | null {
		if (id < 0) return null;
		const cached = this.#entries.get(id);
		if (cached) return cached;
		const decoded = decodeTexture(this.#model, id);
		if (decoded) this.#entries.set(id, decoded);
		return decoded;
	}

	skybox(): THREE.CubeTexture | null {
		const tex = decodeSkybox(this.#model);
		return tex;
	}

	dispose(): void {
		for (const tex of this.#entries.values()) tex.dispose();
		this.#entries.clear();
	}
}
