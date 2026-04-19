/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMujocoContext } from '../../core/context.js';
import { useAfterPhysicsStep } from '../../core/physicsStep.svelte.js';
import { findBodyByName, getName } from '../../core/SceneLoader.js';
import { getContact } from '../../types.js';
import type { Bodies, ContactInfo, MujocoModel } from '../../types.js';

// Cache geom names per model to avoid cross-model id collisions.
const geomNameCacheByModel = new WeakMap<MujocoModel, Map<number, string>>();

function getGeomNameCached(model: MujocoModel, geomId: number): string {
	let perModel = geomNameCacheByModel.get(model);
	if (!perModel) {
		perModel = new Map<number, string>();
		geomNameCacheByModel.set(model, perModel);
	}
	let name = perModel.get(geomId);
	if (name === undefined) {
		name = getName(model, model.name_geomadr[geomId]);
		perModel.set(geomId, name);
	}
	return name;
}

export interface ContactsHandle {
	readonly list: ContactInfo[];
}

/**
 * Track contacts for a specific body (or all contacts if no body specified).
 *
 * Returns a handle whose `.list` getter is updated every physics frame.
 * Optionally pass a callback for event-driven consumption.
 */
export function useContacts(
	bodyName?: Bodies,
	callback?: (contacts: ContactInfo[]) => void
): ContactsHandle {
	const sim = useMujocoContext();
	let contacts: ContactInfo[] = [];
	let bodyId = -1;
	let bodyResolved = false;

	$effect(() => {
		if (!bodyName) {
			bodyId = -1;
			bodyResolved = true;
			return;
		}
		bodyResolved = false;
		if (sim.status !== 'ready') return;
		const model = sim.mjModel;
		if (!model) return;
		bodyId = findBodyByName(model, bodyName);
		bodyResolved = true;
	});

	useAfterPhysicsStep((model, data) => {
		if (bodyName && !bodyResolved) {
			bodyId = findBodyByName(model, bodyName);
			bodyResolved = true;
		}
		const ncon = data.ncon;
		if (ncon === 0) {
			if (contacts.length > 0) contacts = [];
			callback?.([]);
			return;
		}
		const next: ContactInfo[] = [];
		for (let i = 0; i < ncon; i++) {
			const c = getContact(data, i);
			if (!c) break;
			if (bodyId >= 0) {
				const b1 = model.geom_bodyid[c.geom1];
				const b2 = model.geom_bodyid[c.geom2];
				if (b1 !== bodyId && b2 !== bodyId) continue;
			}
			next.push({
				geom1: c.geom1,
				geom1Name: getGeomNameCached(model, c.geom1),
				geom2: c.geom2,
				geom2Name: getGeomNameCached(model, c.geom2),
				pos: [c.pos[0], c.pos[1], c.pos[2]],
				depth: c.dist
			});
		}
		contacts = next;
		callback?.(next);
	});

	return {
		get list() {
			return contacts;
		}
	};
}

/**
 * Contact enter/exit events for a specific body.
 * Tracks which geom pairs are in contact frame-to-frame and fires the
 * appropriate callback on transitions.
 */
export function useContactEvents(
	bodyName: Bodies,
	handlers: {
		onEnter?: (info: ContactInfo) => void;
		onExit?: (info: ContactInfo) => void;
	}
): void {
	const prevPairs = new Set<string>();
	const prevContactMap = new Map<string, ContactInfo>();

	useContacts(bodyName, (contacts: ContactInfo[]) => {
		const currentPairs = new Set<string>();
		const currentMap = new Map<string, ContactInfo>();
		for (const c of contacts) {
			const key = `${Math.min(c.geom1, c.geom2)}_${Math.max(c.geom1, c.geom2)}`;
			currentPairs.add(key);
			currentMap.set(key, c);
		}
		for (const key of currentPairs) {
			if (!prevPairs.has(key)) handlers.onEnter?.(currentMap.get(key)!);
		}
		for (const key of prevPairs) {
			if (!currentPairs.has(key)) {
				const prev = prevContactMap.get(key);
				if (prev) handlers.onExit?.(prev);
			}
		}
		prevPairs.clear();
		for (const k of currentPairs) prevPairs.add(k);
		prevContactMap.clear();
		for (const [k, v] of currentMap) prevContactMap.set(k, v);
	});
}
