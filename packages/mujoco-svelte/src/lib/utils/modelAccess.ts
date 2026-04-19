/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Readers that pull typed poses / transforms out of a MuJoCo `model` or
 * `data` and write them into pre-allocated THREE objects — zero allocation
 * per frame, which matters when a task iterates over every body or geom.
 *
 * The readers hide three bits of coupling that every consumer otherwise
 * open-codes:
 *
 *   1. **Index arithmetic** — `data.xpos[3*id..+2]`, `data.xquat[4*id..+3]`,
 *      `model.jnt_pos[3*jid..+2]`, and so on. Centralising keeps consumers
 *      from accidentally using the wrong stride.
 *   2. **Quaternion order** — MuJoCo stores `[w, x, y, z]`; THREE expects
 *      `[x, y, z, w]`. `readBodyQuat` does the swap once.
 *   3. **Optional field fallbacks** — `data.xipos` (per-COM) isn't present
 *      on every build; `readBodyCom` falls back to `xpos` transparently.
 *
 * All readers return the `out` argument so calls can be chained:
 * ```ts
 * readBodyPos(data, bid, _v).applyMatrix4(someMatrix);
 * ```
 * When an optional source field is missing, readers return `null` instead of
 * filling `out` with garbage — check the return before using the target.
 */
import * as THREE from 'three';
import type { MujocoData, MujocoModel } from '../types.js';

// ---------- Body ----------

/** Write body world position `data.xpos[3*id..+2]` into `out`. */
export function readBodyPos(
	data: MujocoData,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 {
	const i = id * 3;
	return out.set(data.xpos[i], data.xpos[i + 1], data.xpos[i + 2]);
}

/**
 * Write body world quaternion into `out`. Reorders MuJoCo's `[w, x, y, z]`
 * layout to THREE's `[x, y, z, w]`.
 */
export function readBodyQuat(
	data: MujocoData,
	id: number,
	out: THREE.Quaternion
): THREE.Quaternion {
	const i = id * 4;
	return out.set(data.xquat[i + 1], data.xquat[i + 2], data.xquat[i + 3], data.xquat[i]);
}

/**
 * Write body center-of-mass position into `out`. Prefers `data.xipos`
 * (available on standard builds and at joint origin-independent COM) and
 * falls back to `data.xpos` when the build doesn't expose it.
 */
export function readBodyCom(
	data: MujocoData,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 {
	const src = data.xipos ?? data.xpos;
	const i = id * 3;
	return out.set(src[i], src[i + 1], src[i + 2]);
}

// ---------- Joint ----------

/**
 * Compute joint anchor in world space — body world pos + body quat * local
 * anchor from `model.jnt_pos`. Requires two scratch objects; pass the same
 * instances every frame to avoid allocation.
 *
 * Returns `out` on success, `null` if the model doesn't expose `jnt_pos`.
 */
export function readJointAnchor(
	model: MujocoModel,
	data: MujocoData,
	jid: number,
	out: THREE.Vector3,
	scratchQuat: THREE.Quaternion,
	scratchVec: THREE.Vector3
): THREE.Vector3 | null {
	const bid = model.jnt_bodyid[jid];
	readBodyPos(data, bid, out);
	const jntPos = model.jnt_pos;
	if (!jntPos) return out; // body origin is a reasonable anchor
	readBodyQuat(data, bid, scratchQuat);
	const i = 3 * jid;
	scratchVec.set(jntPos[i], jntPos[i + 1], jntPos[i + 2]).applyQuaternion(scratchQuat);
	return out.add(scratchVec);
}

/**
 * Compute joint axis in world space — body quat * local axis from
 * `model.jnt_axis`, normalised.
 *
 * Returns `out` on success, `null` if the model doesn't expose `jnt_axis`.
 */
export function readJointAxis(
	model: MujocoModel,
	data: MujocoData,
	jid: number,
	out: THREE.Vector3,
	scratchQuat: THREE.Quaternion
): THREE.Vector3 | null {
	const jntAxis = model.jnt_axis;
	if (!jntAxis) return null;
	const bid = model.jnt_bodyid[jid];
	readBodyQuat(data, bid, scratchQuat);
	const i = 3 * jid;
	return out
		.set(jntAxis[i], jntAxis[i + 1], jntAxis[i + 2])
		.applyQuaternion(scratchQuat)
		.normalize();
}

// ---------- Geom ----------

/**
 * Write geom world position into `out`. Prefers `data.geom_xpos` (precomputed
 * each step); returns `null` when the build doesn't expose it — callers can
 * fall back to body xpos + geom_pos if needed.
 */
export function readGeomPos(
	data: MujocoData,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 | null {
	const xp = data.geom_xpos;
	if (!xp) return null;
	const i = id * 3;
	return out.set(xp[i], xp[i + 1], xp[i + 2]);
}

/**
 * Write geom orientation as a 4x4 matrix into `out`. MuJoCo stores the 3x3
 * rotation in `data.geom_xmat` row-major; we widen to a 4x4 so callers can
 * extract quaternion or scale via THREE's helpers.
 */
export function readGeomMatrix(
	data: MujocoData,
	id: number,
	out: THREE.Matrix4
): THREE.Matrix4 | null {
	const xm = data.geom_xmat;
	if (!xm) return null;
	const off = id * 9;
	return out.set(
		xm[off], xm[off + 1], xm[off + 2], 0,
		xm[off + 3], xm[off + 4], xm[off + 5], 0,
		xm[off + 6], xm[off + 7], xm[off + 8], 0,
		0, 0, 0, 1
	);
}

// ---------- Site ----------

/** Write site world position `data.site_xpos[3*id..+2]` into `out`. */
export function readSitePos(
	data: MujocoData,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 {
	const sp = data.site_xpos;
	const i = id * 3;
	return out.set(sp[i], sp[i + 1], sp[i + 2]);
}

/** Write site world matrix into `out` (from `data.site_xmat`, row-major 3x3). */
export function readSiteMatrix(
	data: MujocoData,
	id: number,
	out: THREE.Matrix4
): THREE.Matrix4 | null {
	const sm = data.site_xmat;
	if (!sm) return null;
	const off = id * 9;
	return out.set(
		sm[off], sm[off + 1], sm[off + 2], 0,
		sm[off + 3], sm[off + 4], sm[off + 5], 0,
		sm[off + 6], sm[off + 7], sm[off + 8], 0,
		0, 0, 0, 1
	);
}

// ---------- Camera ----------

/**
 * Write camera world matrix into `out` — combines `data.cam_xpos` (position)
 * and `data.cam_xmat` (3x3 rotation, row-major). Returns `null` if either is
 * missing from the build.
 */
export function readCameraMatrix(
	data: MujocoData,
	id: number,
	out: THREE.Matrix4
): THREE.Matrix4 | null {
	const xp = data.cam_xpos;
	const xm = data.cam_xmat;
	if (!xp || !xm) return null;
	const off = id * 9;
	const p = id * 3;
	return out.set(
		xm[off], xm[off + 1], xm[off + 2], xp[p],
		xm[off + 3], xm[off + 4], xm[off + 5], xp[p + 1],
		xm[off + 6], xm[off + 7], xm[off + 8], xp[p + 2],
		0, 0, 0, 1
	);
}

/** Write camera world position into `out`. */
export function readCameraPos(
	data: MujocoData,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 | null {
	const xp = data.cam_xpos;
	if (!xp) return null;
	const i = id * 3;
	return out.set(xp[i], xp[i + 1], xp[i + 2]);
}

// ---------- Light ----------

/**
 * Write light position into `out`. Reads from `model.light_pos` — lights are
 * static in MuJoCo (they don't have a per-step `xpos`).
 */
export function readLightPos(
	model: MujocoModel,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 | null {
	const lp = model.light_pos;
	if (!lp) return null;
	const i = id * 3;
	return out.set(lp[i], lp[i + 1], lp[i + 2]);
}

/** Write light direction into `out`. */
export function readLightDir(
	model: MujocoModel,
	id: number,
	out: THREE.Vector3
): THREE.Vector3 | null {
	const ld = model.light_dir;
	if (!ld) return null;
	const i = id * 3;
	return out.set(ld[i], ld[i + 1], ld[i + 2]);
}

// ---------- Per-body introspection ----------

/**
 * Maximum `geom_size[0]` across the geoms attached to body `bid`. Commonly
 * used to scale selection / debug markers so they match the visual weight of
 * the body they anchor to. Returns 0 if the body has no geoms.
 */
export function maxBodyGeomSize(model: MujocoModel, bid: number): number {
	const adr = model.body_geomadr?.[bid] ?? -1;
	const num = model.body_geomnum?.[bid] ?? 0;
	if (adr < 0 || num <= 0) return 0;
	let max = 0;
	for (let k = 0; k < num; k++) {
		const size = model.geom_size[3 * (adr + k)];
		if (size > max) max = size;
	}
	return max;
}

// ---------- Tendon ----------

/**
 * Yield tendon wrap-point world positions for tendon `tid`. Skips (0,0,0)
 * sentinel points that MuJoCo emits for inactive wraps. Consumers typically
 * push into a reusable `Vector3[]` then feed into a curve builder.
 */
export function* iterTendonWrapPoints(
	model: MujocoModel,
	data: MujocoData,
	tid: number
): IterableIterator<[number, number, number]> {
	const wrapAdr = model.ten_wrapadr;
	const wrapNum = model.ten_wrapnum;
	const wrapXpos = data.wrap_xpos;
	if (!wrapAdr || !wrapNum || !wrapXpos) return;
	const adr = wrapAdr[tid];
	const num = wrapNum[tid];
	for (let w = 0; w < num; w++) {
		const idx = (adr + w) * 3;
		if (idx + 2 >= wrapXpos.length) break;
		const x = wrapXpos[idx];
		const y = wrapXpos[idx + 1];
		const z = wrapXpos[idx + 2];
		if (x === 0 && y === 0 && z === 0) continue;
		yield [x, y, z];
	}
}
