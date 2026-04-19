/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared helpers for on-screen overlays (hover highlights, gizmos, debug
 * markers, selection representations). Two concerns:
 *
 *   1. `makeOverlayObject` — apply the "always on top, can't be picked,
 *      never culled, translucent material" settings to an object (and all
 *      its descendants). Consolidates the depthTest/renderOrder/raycast
 *      boilerplate that every debug + selection component otherwise hand
 *      rolls.
 *
 *   2. `PulseAnimator` — compute sin-wave pulse factors (scale + opacity)
 *      for a given time `t`. One class, stateless once constructed, so a
 *      single `useTask` can drive many pulsed overlays.
 */
import * as THREE from 'three';

const NOOP_RAYCAST = () => {};

export type OverlayOptions = {
	/** Render order. Default 999 (above most scene content). */
	renderOrder?: number;
	/** Disable depth testing so the overlay draws over geometry. Default true. */
	depthTest?: boolean;
	/** Mark materials as transparent. Default true. */
	transparent?: boolean;
	/** If provided, set material opacity on every descendant. */
	opacity?: number;
	/** Additive blending (for glow halos). Default false. */
	additive?: boolean;
	/** BackSide rendering (for inverted-hull shells). Default false. */
	backSide?: boolean;
	/** Disable frustum culling. Default true. */
	disableCull?: boolean;
	/** Replace `.raycast` with a no-op so the object never blocks picking. Default true. */
	ignoreRaycast?: boolean;
	/** Don't write depth (useful for glow layers). Default true. */
	depthWrite?: boolean;
};

type MaterialHost = THREE.Object3D & {
	material?: THREE.Material | THREE.Material[];
};

/**
 * Configure `obj` and all descendants for overlay rendering. Returns the
 * same object so it can be chained: `parent.add(makeOverlayObject(mesh))`.
 *
 * Traverses descendants so composite helpers (ArrowHelper = line + cone,
 * CameraHelper = many line segments, grouped gizmos) pick up the settings
 * uniformly.
 */
export function makeOverlayObject<T extends THREE.Object3D>(obj: T, options: OverlayOptions = {}): T {
	const {
		renderOrder = 999,
		depthTest = false,
		transparent = true,
		opacity,
		additive = false,
		backSide = false,
		disableCull = true,
		ignoreRaycast = true,
		depthWrite = false
	} = options;

	obj.traverse((child) => {
		child.renderOrder = renderOrder;
		if (disableCull) child.frustumCulled = false;
		if (ignoreRaycast) child.raycast = NOOP_RAYCAST;
		const mat = (child as MaterialHost).material;
		if (!mat) return;
		const mats = Array.isArray(mat) ? mat : [mat];
		for (const m of mats) {
			if (!m) continue;
			m.transparent = transparent;
			m.depthTest = depthTest;
			m.depthWrite = depthWrite;
			if (additive) m.blending = THREE.AdditiveBlending;
			if (backSide && 'side' in m) {
				(m as THREE.Material & { side: THREE.Side }).side = THREE.BackSide;
			}
			if (opacity !== undefined && 'opacity' in m) {
				(m as THREE.Material & { opacity: number }).opacity = opacity;
			}
		}
	});
	return obj;
}

export type PulseConfig = {
	/** Baseline value the scale oscillates around. Default 1. */
	baseScale?: number;
	/** Baseline value the opacity oscillates around. Default 0.7. */
	baseOpacity?: number;
	/** Scale swing, as a fraction of `baseScale`. Default 0.15 → ±15%. */
	scaleAmp?: number;
	/** Opacity swing, as a fraction of `baseOpacity`. Default 0.3 → ±30%. */
	opacityAmp?: number;
	/** Oscillation rate (rad/s). Default 4. */
	speed?: number;
	/** Per-instance phase offset (rad). Stagger by `(id * 0.37) % (2π)` to
	 * keep multi-marker highlights from syncing into one blob. Default 0. */
	phase?: number;
};

export type PulseFactors = { scale: number; opacity: number };

type OpacityMaterial = THREE.Material & { opacity: number };

/**
 * Computes sin-wave scale + opacity factors for a given time. One instance
 * per animated marker; call `apply` each frame from a single driver task.
 *
 * The animator is stateless — all state lives on the caller's object — so
 * it's safe to share, serialize, or swap at runtime.
 */
export class PulseAnimator {
	readonly baseScale: number;
	readonly baseOpacity: number;
	readonly scaleAmp: number;
	readonly opacityAmp: number;
	readonly speed: number;
	readonly phase: number;

	constructor(config: PulseConfig = {}) {
		this.baseScale = config.baseScale ?? 1;
		this.baseOpacity = config.baseOpacity ?? 0.7;
		this.scaleAmp = config.scaleAmp ?? 0.15;
		this.opacityAmp = config.opacityAmp ?? 0.3;
		this.speed = config.speed ?? 4;
		this.phase = config.phase ?? 0;
	}

	/** Current (scale, opacity) at time `t` (seconds). */
	factors(t: number): PulseFactors {
		const s = Math.sin(t * this.speed + this.phase);
		return {
			scale: this.baseScale * (1 + this.scaleAmp * s),
			opacity: Math.max(0, this.baseOpacity * (1 + this.opacityAmp * s))
		};
	}

	/**
	 * Drive pulse into `obj.scale` and each material's `.opacity` at time `t`.
	 * `materials` accepts a single material or an array — every highlight
	 * effect (edges / shell / halo) gets the same opacity, which is what the
	 * current components already assume.
	 */
	apply(
		obj: THREE.Object3D,
		materials: OpacityMaterial | ReadonlyArray<OpacityMaterial>,
		t: number
	): void {
		const { scale, opacity } = this.factors(t);
		obj.scale.setScalar(scale);
		if (Array.isArray(materials)) {
			for (const m of materials) m.opacity = opacity;
		} else {
			(materials as OpacityMaterial).opacity = opacity;
		}
	}
}

/**
 * Compute a deterministic phase offset from an integer id so multi-marker
 * highlights don't pulse in lockstep. Matches the `(gid * 0.37) % (2π)`
 * scheme that GeomHoverOverlay already uses.
 */
export function phaseFromId(id: number): number {
	return (id * 0.37) % (Math.PI * 2);
}
