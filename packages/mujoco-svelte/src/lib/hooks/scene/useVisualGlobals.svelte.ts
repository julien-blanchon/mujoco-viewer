/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useVisualGlobals — reactive reader for `<visual><global>` + `<visual><map>`.
 *
 * Consumers use this to seed their own camera (znear/zfar/fovy) or compute
 * the default orbit pose (azimuth/elevation). Returns stable getter shape
 * regardless of which mujoco-js build flavor is active.
 */

import { useMujocoContext } from '../../core/context.js';

export interface VisualGlobals {
	/** Field of view in degrees. Default 45. */
	fovy: number;
	/** Orbit azimuth (deg). */
	azimuth: number;
	/** Orbit elevation (deg). */
	elevation: number;
	/** Near clip plane. */
	znear: number;
	/** Far clip plane. */
	zfar: number;
	/** Interpupillary distance for stereo. */
	ipd: number;
}

const DEFAULTS: VisualGlobals = {
	fovy: 45,
	azimuth: 90,
	elevation: -14,
	znear: 0.01,
	zfar: 50,
	ipd: 0.068
};

export function useVisualGlobals(): VisualGlobals {
	const sim = useMujocoContext();
	// Recompute whenever the model changes. Consumer sees a plain object but
	// reading it inside a `$derived` in the consumer picks up changes.
	void sim.status;
	const vis = sim.mjModel?.vis;
	const g = vis?.global;
	const m = vis?.map;
	return {
		fovy: g?.fovy ?? DEFAULTS.fovy,
		azimuth: g?.azimuth ?? DEFAULTS.azimuth,
		elevation: g?.elevation ?? DEFAULTS.elevation,
		znear: m?.znear ?? DEFAULTS.znear,
		zfar: m?.zfar ?? DEFAULTS.zfar,
		ipd: g?.ipd ?? DEFAULTS.ipd
	};
}
