/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { CapsuleGeometry } from './CapsuleGeometry.js';
import { Reflector } from './Reflector.js';
import type { MujocoModel, MujocoModule } from '../types.js';
import type { MaterialFactory } from './MaterialFactory.js';

// `mjtGeom` enum values — stable across MuJoCo versions, hardcoded so
// GeomBuilder doesn't need the module handle just to read them.
const MJ_GEOM = {
	PLANE: 0,
	HFIELD: 1,
	SPHERE: 2,
	CAPSULE: 3,
	ELLIPSOID: 4,
	CYLINDER: 5,
	BOX: 6,
	MESH: 7
} as const;

/**
 * GeomBuilder
 * RESPONSIBILITY: Manufacturing visual objects.
 *
 * Knows how to read a single MuJoCo geom and build the matching Three.js
 * mesh. Material selection is delegated to an optional `MaterialFactory`,
 * which honors textures, specular/emission, and env maps. When no factory
 * is provided (legacy call-sites / tests), falls back to a flat
 * `MeshStandardMaterial` driven by `mat_rgba` / `geom_rgba`.
 */
export class GeomBuilder {
	private mujoco: MujocoModule | null;
	private factory: MaterialFactory | null;
	/** Disable plane mirroring (used when `render.reflection` is off). */
	private useReflector: boolean;

	constructor(
		mujoco?: MujocoModule | null,
		factory?: MaterialFactory | null,
		options: { useReflector?: boolean } = {}
	) {
		this.mujoco = mujoco ?? null;
		this.factory = factory ?? null;
		this.useReflector = options.useReflector ?? true;
	}

	create(mjModel: MujocoModel, g: number): THREE.Object3D | null {
		if (mjModel.geom_group[g] === 3) return null;

		const type = mjModel.geom_type[g];
		const size = mjModel.geom_size.subarray(g * 3, g * 3 + 3);
		const pos = mjModel.geom_pos.subarray(g * 3, g * 3 + 3);
		const quat = mjModel.geom_quat.subarray(g * 4, g * 4 + 4);

		// Build the geometry based on type.
		let geo: THREE.BufferGeometry | null = null;

		if (type === MJ_GEOM.PLANE) {
			geo = new THREE.PlaneGeometry(size[0] * 2 || 5, size[1] * 2 || 5);
		} else if (type === MJ_GEOM.SPHERE) {
			geo = new THREE.SphereGeometry(size[0], 24, 24);
		} else if (type === MJ_GEOM.CAPSULE) {
			geo = new CapsuleGeometry(size[0], size[1] * 2, 24, 12);
			geo.rotateX(Math.PI / 2);
		} else if (type === MJ_GEOM.BOX) {
			geo = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
		} else if (type === MJ_GEOM.CYLINDER) {
			geo = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 24);
			geo.rotateX(Math.PI / 2);
		} else if (type === MJ_GEOM.ELLIPSOID) {
			geo = new THREE.SphereGeometry(1, 24, 24);
			geo.scale(size[0], size[1], size[2]);
		} else if (type === MJ_GEOM.MESH) {
			const mId = mjModel.geom_dataid[g];
			const vAdr = mjModel.mesh_vertadr[mId];
			const vNum = mjModel.mesh_vertnum[mId];
			const fAdr = mjModel.mesh_faceadr[mId];
			const fNum = mjModel.mesh_facenum[mId];

			const faces = mjModel.mesh_face;
			const verts = mjModel.mesh_vert;

			// OBJ-style meshes expose UVs through a separate index stream
			// (mesh_facetexcoord). Likewise for per-vertex normals via
			// mesh_facenormal. When either is present we can't reuse the
			// indexed geometry fast path — corners of the same face may want
			// different UV/normal — so expand to non-indexed geometry.
			const texcoordAdr = mjModel.mesh_texcoordadr?.[mId] ?? -1;
			const texcoordNum = mjModel.mesh_texcoordnum?.[mId] ?? 0;
			const faceTexcoords = mjModel.mesh_facetexcoord;
			const texcoords = mjModel.mesh_texcoord;
			const hasUV =
				texcoordAdr >= 0 && texcoordNum > 0 && !!faceTexcoords && !!texcoords;

			const normalAdr = mjModel.mesh_normaladr?.[mId] ?? -1;
			const faceNormals = mjModel.mesh_facenormal;
			const normals = mjModel.mesh_normal;
			const hasNormalIdx = normalAdr >= 0 && !!faceNormals && !!normals;

			geo = new THREE.BufferGeometry();

			if (hasUV || hasNormalIdx) {
				// Non-indexed: one corner per face × 3.
				const cornerCount = fNum * 3;
				const positions = new Float32Array(cornerCount * 3);
				const uvs = hasUV ? new Float32Array(cornerCount * 2) : null;
				const outNormals = hasNormalIdx ? new Float32Array(cornerCount * 3) : null;

				for (let t = 0; t < fNum; t++) {
					for (let c = 0; c < 3; c++) {
						const cornerIdx = (fAdr + t) * 3 + c;
						const outCorner = t * 3 + c;

						// Position (mesh_face[..] are local-to-mesh vertex indices).
						const vi = faces[cornerIdx];
						const vOff = (vAdr + vi) * 3;
						const pOff = outCorner * 3;
						positions[pOff] = verts[vOff];
						positions[pOff + 1] = verts[vOff + 1];
						positions[pOff + 2] = verts[vOff + 2];

						if (uvs) {
							const ti = faceTexcoords![cornerIdx];
							const tOff = (texcoordAdr + ti) * 2;
							const uOff = outCorner * 2;
							uvs[uOff] = texcoords![tOff];
							// MuJoCo's internal texture buffer is bottom-row-first
							// (OpenGL convention). Our DataTexture has
							// `flipY = true`, so the GPU sees top-row-first. OBJ
							// UVs have (0,0) at bottom-left, so we mirror V to
							// match the flipped image — otherwise the texture
							// appears upside-down on the mesh.
							uvs[uOff + 1] = 1 - texcoords![tOff + 1];
						}

						if (outNormals) {
							const ni = faceNormals![cornerIdx];
							const nOff = (normalAdr + ni) * 3;
							outNormals[pOff] = normals![nOff];
							outNormals[pOff + 1] = normals![nOff + 1];
							outNormals[pOff + 2] = normals![nOff + 2];
						}
					}
				}

				geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
				if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
				if (outNormals) {
					geo.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
				} else {
					geo.computeVertexNormals();
				}
			} else {
				// Fast path for procedural meshes: shared vertices + indexed faces.
				geo.setAttribute(
					'position',
					new THREE.Float32BufferAttribute(
						verts.subarray(vAdr * 3, (vAdr + vNum) * 3),
						3
					)
				);
				geo.setIndex(Array.from(faces.subarray(fAdr * 3, (fAdr + fNum) * 3)));
				geo.computeVertexNormals();
			}
		}

		if (!geo) return null;

		// Plane reflection: keep Reflector when a MaterialFactory is not driving
		// the lookup (legacy / no env map case) AND useReflector is on. When we
		// have a full factory-driven flow, prefer the physical material (with
		// potential envMap reflection) so texture/emission/transparency all work.
		if (type === MJ_GEOM.PLANE && this.useReflector && !this.factory) {
			const matId = mjModel.geom_matid[g];
			const rgba =
				matId >= 0
					? mjModel.mat_rgba.subarray(matId * 4, matId * 4 + 4)
					: mjModel.geom_rgba.subarray(g * 4, g * 4 + 4);
			const color = new THREE.Color(rgba[0], rgba[1], rgba[2]);
			const mesh = new Reflector(geo, {
				clipBias: 0.003,
				textureWidth: 1024,
				textureHeight: 1024,
				color,
				mixStrength: 0.25
			});
			this.applyTransform(mesh, g, pos, quat, mjModel);
			return mesh;
		}

		const material = this.factory
			? this.factory.createForGeom(g)
			: this.legacyMaterial(mjModel, g);

		const mesh = new THREE.Mesh(geo, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.applyTransform(mesh, g, pos, quat, mjModel);
		return mesh;
	}

	private legacyMaterial(mjModel: MujocoModel, g: number): THREE.MeshStandardMaterial {
		const matId = mjModel.geom_matid[g];
		const color = new THREE.Color(0xffffff);
		let opacity = 1.0;
		if (matId >= 0) {
			const rgba = mjModel.mat_rgba.subarray(matId * 4, matId * 4 + 4);
			color.setRGB(rgba[0], rgba[1], rgba[2]);
			opacity = rgba[3];
		} else {
			const rgba = mjModel.geom_rgba.subarray(g * 4, g * 4 + 4);
			color.setRGB(rgba[0], rgba[1], rgba[2]);
			opacity = rgba[3];
		}
		return new THREE.MeshStandardMaterial({
			color,
			transparent: opacity < 1,
			opacity,
			roughness: 0.6,
			metalness: 0.2
		});
	}

	private applyTransform(
		mesh: THREE.Object3D,
		g: number,
		pos: Float64Array,
		quat: Float64Array,
		mjModel: MujocoModel
	): void {
		mesh.position.set(pos[0], pos[1], pos[2]);
		// MuJoCo quaternions are [w, x, y, z]; Three.js are [x, y, z, w].
		mesh.quaternion.set(quat[1], quat[2], quat[3], quat[0]);
		mesh.userData.bodyID = mjModel.geom_bodyid[g];
		mesh.userData.geomID = g;
	}
}
