/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MaterialFactory
 *
 * Produces `THREE.MeshPhysicalMaterial` instances for MuJoCo geoms, honoring:
 *
 *   - `mat_rgba`      → color + opacity
 *   - `mat_emission`  → emissive + emissiveIntensity
 *   - `mat_specular`  → inverse-roughness (Phong-ish → PBR approximation)
 *   - `mat_shininess` → further sharpens specular
 *   - `mat_reflectance` → metalness (+ envMap if provided)
 *   - `mat_texid`     → `.map` from decoded 2D texture
 *   - `mat_texrepeat` → texture.repeat
 *   - `mat_texuniform` → force wrap `RepeatWrapping` (vs. clamp)
 *
 * Falls back to `mat_rgba` (or `geom_rgba`) when a geom has no material.
 * Caches materials by (matId|-1 for anonymous) so identical geoms share a
 * GPU program instance; disposed together on teardown.
 */

import * as THREE from 'three';
import type { MujocoModel } from '../types.js';
import type { TextureCache } from './TextureDecoder.js';

/** MuJoCo 3.x packs ten texture roles per material (RGB, roughness, normal, …). */
const MJ_NTEXROLE = 10;
const MJ_TEXROLE_RGB = 1;

/** Read the diffuse (RGB role) texture id for a material. Returns -1 when unset. */
function matTexIdRGB(model: MujocoModel, matId: number): number {
	const arr = model.mat_texid;
	if (!arr) return -1;
	if (arr.length === model.nmat) {
		// Older mujoco-js builds expose a flat array (1 slot per material).
		return arr[matId] ?? -1;
	}
	return arr[matId * MJ_NTEXROLE + MJ_TEXROLE_RGB] ?? -1;
}

export interface MaterialFactoryOptions {
	/** Optional environment map — attached as envMap on reflective materials. */
	envMap?: THREE.CubeTexture | null;
	/** Global default metalness when the material doesn't specify reflectance. */
	defaultMetalness?: number;
	/** Global default roughness. */
	defaultRoughness?: number;
}

export class MaterialFactory {
	#model: MujocoModel;
	#textures: TextureCache;
	#envMap: THREE.CubeTexture | null;
	#defaultMetalness: number;
	#defaultRoughness: number;
	#cache = new Map<number, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>();

	constructor(
		model: MujocoModel,
		textures: TextureCache,
		options: MaterialFactoryOptions = {}
	) {
		this.#model = model;
		this.#textures = textures;
		this.#envMap = options.envMap ?? null;
		this.#defaultMetalness = options.defaultMetalness ?? 0.1;
		this.#defaultRoughness = options.defaultRoughness ?? 0.6;
	}

	/**
	 * Build or reuse a cached material for the given geom. Cache key is the
	 * material id; geoms that share a material share a material instance.
	 * Returns a fresh MeshStandardMaterial for anonymous geoms so per-geom
	 * RGBA tweaks don't bleed into siblings.
	 */
	createForGeom(g: number): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
		const model = this.#model;
		const matId = model.geom_matid[g];

		if (matId < 0) {
			// No shared material — build a lean StandardMaterial from geom_rgba.
			return this.#buildAnonymous(g);
		}

		const cached = this.#cache.get(matId);
		if (cached) return cached;

		const mat = this.#buildFromMaterial(matId);
		this.#cache.set(matId, mat);
		return mat;
	}

	#buildAnonymous(g: number): THREE.MeshStandardMaterial {
		const model = this.#model;
		const rgba = model.geom_rgba.subarray(g * 4, g * 4 + 4);
		const mat = new THREE.MeshStandardMaterial({
			color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
			transparent: rgba[3] < 1,
			opacity: rgba[3],
			roughness: this.#defaultRoughness,
			metalness: this.#defaultMetalness
		});
		if (this.#envMap) mat.envMap = this.#envMap;
		return mat;
	}

	#buildFromMaterial(matId: number): THREE.MeshPhysicalMaterial {
		const model = this.#model;
		const rgba = model.mat_rgba.subarray(matId * 4, matId * 4 + 4);
		const emission = model.mat_emission?.[matId] ?? 0;
		const specular = model.mat_specular?.[matId] ?? 0;
		const shininess = model.mat_shininess?.[matId] ?? 0;
		const reflectance = model.mat_reflectance?.[matId] ?? 0;
		const texId = matTexIdRGB(model, matId);
		const texRepeatU = model.mat_texrepeat?.[2 * matId] ?? 1;
		const texRepeatV = model.mat_texrepeat?.[2 * matId + 1] ?? 1;
		const texUniform = (model.mat_texuniform?.[matId] ?? 0) !== 0;

		// MuJoCo uses Phong-style specular + shininess; roughly convert to PBR:
		// high specular + high shininess → low roughness; low specular → fully rough.
		const roughness = THREE.MathUtils.clamp(
			1 - Math.min(1, specular * 0.6 + shininess * 0.4),
			0.05,
			1
		);
		const metalness = THREE.MathUtils.clamp(reflectance, 0, 1);

		const mat = new THREE.MeshPhysicalMaterial({
			color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
			transparent: rgba[3] < 1,
			opacity: rgba[3],
			roughness,
			metalness,
			emissive: emission > 0 ? new THREE.Color(rgba[0], rgba[1], rgba[2]) : new THREE.Color(0, 0, 0),
			emissiveIntensity: emission,
			clearcoat: reflectance > 0.2 ? reflectance : 0,
			clearcoatRoughness: 0.05,
			side: THREE.DoubleSide
		});

		if (this.#envMap) {
			mat.envMap = this.#envMap;
			// Give reflective materials a stronger envMap bite.
			mat.envMapIntensity = 0.5 + metalness * 0.75;
		}

		// Apply the diffuse texture if any.
		if (texId >= 0) {
			const decoded = this.#textures.get(texId);
			if (decoded && !(decoded as THREE.CubeTexture).isCubeTexture) {
				const tex = decoded as THREE.Texture;
				tex.wrapS = THREE.RepeatWrapping;
				tex.wrapT = THREE.RepeatWrapping;
				tex.repeat.set(
					texUniform ? 1 : texRepeatU,
					texUniform ? 1 : texRepeatV
				);
				mat.map = tex;
			}
		}

		return mat;
	}

	dispose(): void {
		for (const mat of this.#cache.values()) mat.dispose();
		this.#cache.clear();
	}
}
