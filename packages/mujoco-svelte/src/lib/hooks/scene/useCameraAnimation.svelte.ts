/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useCameraAnimation — composable camera animation hook.
 */

import * as THREE from 'three';
import { useTask, useThrelte } from '@threlte/core';

export interface CameraAnimationAPI {
	getCameraState(): { position: THREE.Vector3; target: THREE.Vector3 };
	moveCameraTo(
		position: THREE.Vector3,
		target: THREE.Vector3,
		durationMs: number
	): Promise<void>;
}

/**
 * Standalone hook for animated camera transitions.
 *
 * Manages its own render task — drop it into any component inside a Threlte
 * `<Canvas>`.
 */
export function useCameraAnimation(): CameraAnimationAPI {
	const threlte = useThrelte();

	const orbitTarget = new THREE.Vector3(0, 0, 0);

	const anim = {
		active: false,
		startPos: new THREE.Vector3(),
		endPos: new THREE.Vector3(),
		startRot: new THREE.Quaternion(),
		endRot: new THREE.Quaternion(),
		startTarget: new THREE.Vector3(),
		endTarget: new THREE.Vector3(),
		startTime: 0,
		duration: 0,
		resolve: null as (() => void) | null
	};

	useTask(() => {
		if (!anim.active) return;

		const camera = threlte.camera.current;
		const now = performance.now();
		const progress = Math.min((now - anim.startTime) / anim.duration, 1.0);
		const ease =
			progress < 0.5
				? 4 * progress * progress * progress
				: 1 - Math.pow(-2 * progress + 2, 3) / 2;

		camera.position.lerpVectors(anim.startPos, anim.endPos, ease);
		camera.quaternion.slerpQuaternions(anim.startRot, anim.endRot, ease);
		orbitTarget.lerpVectors(anim.startTarget, anim.endTarget, ease);

		const orbitControls = (threlte as unknown as { controls?: { target?: THREE.Vector3 } })
			.controls;
		if (orbitControls?.target) orbitControls.target.copy(orbitTarget);

		if (progress >= 1.0) {
			anim.active = false;
			camera.position.copy(anim.endPos);
			camera.quaternion.copy(anim.endRot);
			orbitTarget.copy(anim.endTarget);
			anim.resolve?.();
			anim.resolve = null;
		}
	});

	const getCameraState = (): { position: THREE.Vector3; target: THREE.Vector3 } => {
		const camera = threlte.camera.current;
		return {
			position: camera.position.clone(),
			target: orbitTarget.clone()
		};
	};

	const moveCameraTo = (
		position: THREE.Vector3,
		target: THREE.Vector3,
		durationMs: number
	): Promise<void> => {
		return new Promise((resolve) => {
			const camera = threlte.camera.current;
			anim.active = true;
			anim.startTime = performance.now();
			anim.duration = durationMs;
			anim.startPos.copy(camera.position);
			anim.startRot.copy(camera.quaternion);
			anim.startTarget.copy(orbitTarget);
			anim.endPos.copy(position);
			anim.endTarget.copy(target);
			const dummyCam = (camera as THREE.PerspectiveCamera).clone();
			dummyCam.position.copy(position);
			dummyCam.lookAt(target);
			anim.endRot.copy(dummyCam.quaternion);
			anim.resolve = resolve;
			setTimeout(resolve, durationMs + 100);
		});
	};

	return { getCameraState, moveCameraTo };
}
