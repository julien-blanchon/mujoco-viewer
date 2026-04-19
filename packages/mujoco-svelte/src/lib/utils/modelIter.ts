/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generator helpers for iterating MuJoCo model entities. Replaces the
 * `for (let i = 0; i < model.nX; i++)` pattern that every debug / gizmo /
 * renderer component otherwise hand-rolls. Generators let callers spread
 * into arrays, break early, or chain with `.take(n)`-style helpers without
 * committing to an array allocation.
 *
 * Body iteration defaults to skipping the worldbody (body 0). Pass
 * `{ includeWorld: true }` to include it.
 */
import type { MujocoModel } from '../types.js';

export function* iterBodies(
	model: MujocoModel,
	opts?: { includeWorld?: boolean }
): IterableIterator<number> {
	const start = opts?.includeWorld ? 0 : 1;
	for (let i = start; i < model.nbody; i++) yield i;
}

export function* iterJoints(model: MujocoModel): IterableIterator<number> {
	for (let i = 0; i < model.njnt; i++) yield i;
}

export function* iterGeoms(model: MujocoModel): IterableIterator<number> {
	for (let i = 0; i < model.ngeom; i++) yield i;
}

export function* iterSites(model: MujocoModel): IterableIterator<number> {
	for (let i = 0; i < model.nsite; i++) yield i;
}

export function* iterLights(model: MujocoModel): IterableIterator<number> {
	const n = model.nlight ?? 0;
	for (let i = 0; i < n; i++) yield i;
}

export function* iterCameras(model: MujocoModel): IterableIterator<number> {
	const n = model.ncam ?? 0;
	for (let i = 0; i < n; i++) yield i;
}

export function* iterTendons(model: MujocoModel): IterableIterator<number> {
	const n = model.ntendon ?? 0;
	for (let i = 0; i < n; i++) yield i;
}

export function* iterActuators(model: MujocoModel): IterableIterator<number> {
	for (let i = 0; i < model.nu; i++) yield i;
}

export function* iterSensors(model: MujocoModel): IterableIterator<number> {
	for (let i = 0; i < model.nsensor; i++) yield i;
}

/**
 * Yield every body id in the subtree rooted at `rootId` (inclusive). Body
 * parentship follows `body_parentid`; body 0 is its own parent (worldbody)
 * so we stop the walk on `cur <= 0`.
 *
 * Order is pre-order by body id, not BFS/DFS.
 */
export function* iterBodySubtree(model: MujocoModel, rootId: number): IterableIterator<number> {
	if (rootId < 0 || rootId >= model.nbody) return;
	const parentId = model.body_parentid;
	if (!parentId) return;
	for (let bid = 0; bid < model.nbody; bid++) {
		if (bid === rootId) {
			yield bid;
			continue;
		}
		let cur = bid;
		while (cur > 0) {
			if (cur === rootId) {
				yield bid;
				break;
			}
			cur = parentId[cur];
		}
	}
}

/** Yield every geom id attached to body `bid`. */
export function* iterBodyGeoms(model: MujocoModel, bid: number): IterableIterator<number> {
	const start = model.body_geomadr?.[bid] ?? -1;
	const num = model.body_geomnum?.[bid] ?? 0;
	if (start < 0 || num <= 0) return;
	for (let k = 0; k < num; k++) yield start + k;
}

/** True if `bid` is a descendant (inclusive) of `rootId`. */
export function isBodyDescendant(
	model: MujocoModel,
	bid: number,
	rootId: number
): boolean {
	if (bid === rootId) return true;
	const parentId = model.body_parentid;
	if (!parentId) return false;
	let cur = bid;
	while (cur > 0) {
		if (cur === rootId) return true;
		cur = parentId[cur];
	}
	return false;
}
