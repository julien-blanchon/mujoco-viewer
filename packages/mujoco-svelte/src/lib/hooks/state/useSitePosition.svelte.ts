/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { useTask } from '@threlte/core';
import { useMujocoContext } from '../../core/context.js';
import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
import { findSiteByName } from '../../core/SceneLoader.js';
import type { Sites, SitePositionHandle } from '../../types.js';

const _mat4 = new THREE.Matrix4();

/**
 * Track a MuJoCo site's world position and orientation.
 *
 * The returned THREE objects are mutated in place each physics frame.
 */
export function useSitePosition(siteName: Sites): SitePositionHandle {
	const sim = useMujocoContext();
	let siteId = -1;
	const position = new THREE.Vector3();
	const quaternion = new THREE.Quaternion();

	$effect(() => {
		const model = sim.mjModel;
		if (!model || sim.status !== 'ready') {
			siteId = -1;
			return;
		}
		siteId = findSiteByName(model, siteName);
	});

	useTask(
		() => {
			const data = sim.mjData;
			if (!data || siteId < 0) return;

			const i3 = siteId * 3;
			const i9 = siteId * 9;
			position.set(data.site_xpos[i3], data.site_xpos[i3 + 1], data.site_xpos[i3 + 2]);
			const m = data.site_xmat;
			_mat4.set(
				m[i9],     m[i9 + 1], m[i9 + 2], 0,
				m[i9 + 3], m[i9 + 4], m[i9 + 5], 0,
				m[i9 + 6], m[i9 + 7], m[i9 + 8], 0,
				0,         0,         0,         1
			);
			quaternion.setFromRotationMatrix(_mat4);
		},
		{ after: PHYSICS_STEP_KEY }
	);

	return {
		get position() {
			return position;
		},
		get quaternion() {
			return quaternion;
		}
	};
}
