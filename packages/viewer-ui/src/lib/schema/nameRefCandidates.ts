/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Build the list of valid names a name-reference attribute could resolve to,
 * given the current sim. The list is deduped (bodies + geoms may both be
 * valid targets, with overlapping names is unlikely but still flattened) and
 * filtered to non-empty names — unnamed entities can't be referenced by name
 * anyway.
 */

import type { MujocoSimState } from 'mujoco-svelte';
import type { NameRefKind } from './uiMeta.js';

/**
 * Return every unique non-empty entity name of the given kinds, in the order
 * they appear in the model. Order reflects MJCF declaration order so the
 * dropdown follows the familiar entity tree layout.
 */
export function candidateNames(
	sim: MujocoSimState | null,
	kinds: readonly NameRefKind[]
): string[] {
	if (!sim) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const kind of kinds) {
		for (const name of namesOfKind(sim, kind)) {
			if (name && !seen.has(name)) {
				seen.add(name);
				out.push(name);
			}
		}
	}
	return out;
}

function namesOfKind(sim: MujocoSimState, kind: NameRefKind): readonly string[] {
	switch (kind) {
		case 'body':
			return sim.bodies.map((b) => b.name ?? '');
		case 'geom':
			return sim.geoms.map((g) => g.name ?? '');
		case 'joint':
			return sim.joints.map((j) => j.name ?? '');
		case 'site':
			return sim.sites.map((s) => s.name ?? '');
		case 'camera':
			return sim.cameras.map((c) => c.name ?? '');
		case 'light':
			return sim.lights.map((l) => l.name ?? '');
		case 'material':
			return sim.materials.map((m) => m.name ?? '');
		case 'texture':
			return sim.textures.map((t) => t.name ?? '');
		case 'mesh':
			return sim.meshes.map((m) => m.name ?? '');
		case 'tendon':
			return sim.tendons.map((t) => t.name ?? '');
		case 'actuator':
			return sim.actuators.map((a) => a.name ?? '');
	}
}
