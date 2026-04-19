/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useBodyMeshes — returns Three.js meshes belonging to a MuJoCo body.
 *
 * Low-level primitive for custom selection visuals, outlines,
 * postprocessing effects, or any per-body mesh manipulation.
 */

import * as THREE from 'three';
import { useThrelte } from '@threlte/core';

/**
 * Returns a function that collects all Three.js meshes tagged with the given
 * `userData.bodyID`. Call the function inside a `$derived` to make it
 * reactive to scene changes:
 *
 * ```ts
 * const getMeshes = useBodyMeshes();
 * const meshes = $derived(getMeshes(selectedBodyId));
 * ```
 */
export function useBodyMeshes(): (bodyId: number | null) => THREE.Mesh[] {
	const { scene } = useThrelte();

	return (bodyId: number | null) => {
		if (typeof bodyId !== 'number' || bodyId < 0) return [];
		const meshes: THREE.Mesh[] = [];
		scene.traverse((obj) => {
			if (obj.userData.bodyID === bodyId && (obj as THREE.Mesh).isMesh) {
				meshes.push(obj as THREE.Mesh);
			}
		});
		return meshes;
	};
}
