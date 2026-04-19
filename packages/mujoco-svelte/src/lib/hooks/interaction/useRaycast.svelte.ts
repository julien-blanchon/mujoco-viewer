/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useRaycast — raycast the MuJoCo collision world from a ray.
 */

import * as THREE from 'three';
import { useMujocoContext } from '../../core/context.js';
import type { RayHit } from '../../types.js';

/**
 * Cast a ray into the MuJoCo collision world. Returns `null` if nothing is hit.
 */
export function useRaycast(): (
	origin: THREE.Vector3,
	direction: THREE.Vector3,
	maxDist?: number
) => Promise<RayHit | null> {
	const sim = useMujocoContext();
	return (origin, direction, maxDist = 100) =>
		sim.engine.raycast(
			{ x: origin.x, y: origin.y, z: origin.z },
			{ x: direction.x, y: direction.y, z: direction.z },
			maxDist
		);
}
