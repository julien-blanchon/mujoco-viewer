/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Camera controller — owns the Three.js `PerspectiveCamera`, `OrbitControls`,
 * and the `cameraMode` discriminator (free / fixed / track). Provides the
 * selection-focus pipeline that used to live inline in `+page.svelte`.
 *
 * One-shot camera moves (reset view, focus on selection, auto-frame on load)
 * route through a small `tweenTo()` helper so the view glides instead of
 * teleporting. Per-frame motion (WASD pan, body-tracking pose) stays instant
 * because tweening continuous input would introduce lag.
 *
 * The camera and orbit refs are bound via `$state.raw` because Three.js mutates
 * internal matrices every frame; a deep proxy would retrigger every reactive
 * read until the effect depth limit is hit.
 */
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMode, MujocoSimState, Selection } from 'mujoco-svelte';

export interface FrameInfo {
	center: [number, number, number];
	distance: number;
	min: [number, number, number];
	max: [number, number, number];
}

interface TweenOptions {
	/** Duration in ms. Default 350 — tuned for "snappy but noticeable". */
	duration?: number;
	/** Skip the tween and jump to the target instantly. Used on the initial
	 *  load so the scene doesn't zoom in from the default camera pose. */
	animate?: boolean;
}

function easeOutCubic(t: number): number {
	const u = 1 - t;
	return 1 - u * u * u;
}

export class CameraController {
	camera = $state.raw<THREE.PerspectiveCamera | undefined>(undefined);
	orbit = $state.raw<OrbitControlsImpl | undefined>(undefined);
	mode = $state<CameraMode>('free');
	orbitEnabled = $state(true);
	/** Latest scene framing emitted by AutoFrame — cached so `resetView()` can
	 *  re-run the initial framing even after the user has roamed around. */
	lastFrame = $state.raw<FrameInfo | null>(null);
	/** True once the user has moved the camera (drag/zoom, WASD pan, or
	 *  selection follow) away from the framing that `frame()` last installed.
	 *  UI uses this to hide the "Reset view" action while the camera is
	 *  already at the default framing. Cleared by `frame()`. */
	viewDirty = $state(false);
	/** True while the camera is being driven by a mode other than `free`
	 *  (fixed MJCF camera or body tracking). Surfaced to the toolbar so the
	 *  user can see — and cancel — the mode at a glance. */
	get modeLabel(): string | null {
		const m = this.mode;
		if (m === 'free') return null;
		if (typeof m === 'object' && m.kind === 'fixed') return `camera #${m.id}`;
		if (typeof m === 'object' && m.kind === 'track') return `body #${m.bodyId}`;
		return null;
	}

	/**
	 * Fly the camera to a world-space point. Preserves the current view
	 * direction but normalises distance so every click moves visibly. No-op if
	 * camera or orbit refs aren't bound yet.
	 */
	focusOn(point: [number, number, number], opts: TweenOptions = {}): void {
		const cam = this.camera;
		const ctrl = this.orbit;
		if (!cam || !ctrl) return;
		const target = new THREE.Vector3(point[0], point[1], point[2]);
		const offset = cam.position.clone().sub(ctrl.target);
		// Degenerate case: camera was sitting on top of the old target (e.g. a
		// fresh fixed-camera exit). Fall back to a sensible default direction.
		if (offset.lengthSq() < 1e-6) offset.set(2, -2, 1.5);
		const currentDist = offset.length();
		const desiredDist = THREE.MathUtils.clamp(currentDist, 0.8, 4);
		offset.normalize().multiplyScalar(desiredDist);
		const endPos = target.clone().add(offset);
		this.tweenTo(endPos, target, opts, () => {
			this.viewDirty = true;
		});
	}

	/** Update orbit target for tracking mode so the camera pivots around a
	 * moving body. Runs every frame while tracking, so it deliberately skips
	 * tweening — interpolation would introduce a visible lag behind the body. */
	handleFixedPose(pos: THREE.Vector3): void {
		if (typeof this.mode === 'object' && this.mode.kind === 'track' && this.orbit) {
			this.cancelTween();
			this.orbit.target.copy(pos);
			this.orbit.update();
		}
	}

	/** Frame the camera to encompass a bounding box — used by AutoFrame on
	 * initial load. Tweens by default; callers pass `{ animate: false }` on
	 * the first AutoFrame so the scene snaps into place instead of zooming
	 * from the default camera pose. */
	frame(info: FrameInfo, opts: TweenOptions = {}): void {
		this.lastFrame = info;
		const cam = this.camera;
		const ctrl = this.orbit;
		if (!cam || !ctrl) return;
		const [cx, cy, cz] = info.center;
		const d = info.distance;
		const endPos = new THREE.Vector3(cx + d * 0.8, cy - d * 0.8, cz + d * 0.6);
		const endTarget = new THREE.Vector3(cx, cy, cz);
		// Clip planes don't lerp meaningfully — set them up-front so we don't
		// flicker through incorrect near/far during the tween.
		cam.near = Math.max(0.001, d * 0.001);
		cam.far = Math.max(100, d * 10);
		cam.updateProjectionMatrix();
		this.tweenTo(endPos, endTarget, opts, () => {
			this.viewDirty = false;
		});
	}

	/** Abort whichever tween is in flight, leaving the camera where it is
	 *  right now. Called when the user grabs OrbitControls (so their drag
	 *  wins) or when a new tween overrides an old one. */
	cancelTween(): void {
		this.#tween?.cancel();
		this.#tween = null;
	}

	#tween: { cancel: () => void } | null = null;

	private tweenTo(
		endPos: THREE.Vector3,
		endTarget: THREE.Vector3,
		opts: TweenOptions,
		onComplete?: () => void
	): void {
		const cam = this.camera;
		const ctrl = this.orbit;
		if (!cam || !ctrl) return;

		this.cancelTween();

		const animate = opts.animate ?? true;
		if (!animate) {
			cam.position.copy(endPos);
			ctrl.target.copy(endTarget);
			ctrl.update();
			onComplete?.();
			return;
		}

		const startPos = cam.position.clone();
		const startTarget = ctrl.target.clone();
		const duration = Math.max(1, opts.duration ?? 350);
		const startTime = performance.now();
		let cancelled = false;
		let raf = 0;

		const step = (now: number) => {
			if (cancelled) return;
			const t = Math.min(1, (now - startTime) / duration);
			const e = easeOutCubic(t);
			cam.position.lerpVectors(startPos, endPos, e);
			ctrl.target.lerpVectors(startTarget, endTarget, e);
			ctrl.update();
			if (t < 1) {
				raf = requestAnimationFrame(step);
			} else {
				this.#tween = null;
				onComplete?.();
			}
		};
		raf = requestAnimationFrame(step);
		this.#tween = {
			cancel: () => {
				cancelled = true;
				cancelAnimationFrame(raf);
			}
		};
	}

	/** Re-apply the last known scene framing. Used by the toolbar's "reset
	 *  view" button to recover from tree-click-focus or manual navigation.
	 *  Also drops any fixed/tracking camera mode so the free-orbit view is
	 *  restored. No-op before the first AutoFrame fires. */
	resetView(): void {
		if (this.mode !== 'free') this.mode = 'free';
		if (!this.lastFrame) return;
		this.frame(this.lastFrame);
	}

	/** Leave any fixed/tracking mode and return to free-orbit. Used by the
	 *  "Stop tracking" action in the toolbar indicator. */
	stopTracking(): void {
		this.mode = 'free';
	}

	/**
	 * Pan the camera + orbit target together along screen-relative axes.
	 * Used by WASD/arrow fly controls so the view direction doesn't change —
	 * only the pivot and the eye translate in lockstep.
	 *
	 * `panX` moves right, `panY` moves up (screen-space), `panZ` moves along
	 * the view direction (positive = forward, toward the target). All inputs
	 * are world-units.
	 */
	pan(panX: number, panY: number, panZ: number): void {
		const cam = this.camera;
		const ctrl = this.orbit;
		if (!cam || !ctrl) return;
		if (panX === 0 && panY === 0 && panZ === 0) return;
		// User-driven motion overrides any in-flight tween.
		this.cancelTween();
		const right = new THREE.Vector3();
		const up = new THREE.Vector3();
		const forward = new THREE.Vector3();
		forward.subVectors(ctrl.target, cam.position);
		const dist = forward.length();
		if (dist < 1e-6) return;
		forward.normalize();
		right.crossVectors(forward, cam.up).normalize();
		up.copy(cam.up).normalize();
		const delta = new THREE.Vector3();
		delta.addScaledVector(right, panX);
		delta.addScaledVector(up, panY);
		delta.addScaledVector(forward, panZ);
		cam.position.add(delta);
		ctrl.target.add(delta);
		ctrl.update();
		this.viewDirty = true;
	}

	/**
	 * Resolve the selection to a world-space focus point. Returns null for
	 * selections that don't have a spatial anchor (materials, textures,
	 * keyframes) — callers should handle those separately.
	 *
	 * All mjModel/mjData reads are wrapped in a try/catch: during a scene
	 * reload, the emscripten handle can be freed between the effect firing
	 * and the getter executing (`BindingError: … on deleted object`). We
	 * swallow it and return null — the next ready event re-triggers focus.
	 */
	resolveFocusPoint(
		sim: MujocoSimState,
		sel: Selection
	): [number, number, number] | null {
		if (sim.status !== 'ready') return null;
		const data = sim.mjData;
		const model = sim.mjModel;
		if (!data || !model) return null;

		try {
			switch (sel.kind) {
				case 'body':
					if (sel.id >= 0 && sel.id < model.nbody) {
						// xipos (COM) reads more naturally than xpos (joint frame); xipos
						// is also defined for body 0 as the world COM.
						const src = data.xipos ?? data.xpos;
						const i = sel.id * 3;
						return [src[i], src[i + 1], src[i + 2]];
					}
					return null;
				case 'geom':
					if (data.geom_xpos && sel.id < model.ngeom) {
						const i = sel.id * 3;
						return [data.geom_xpos[i], data.geom_xpos[i + 1], data.geom_xpos[i + 2]];
					}
					return null;
				case 'site':
					if (data.site_xpos && sel.id < model.nsite) {
						const i = sel.id * 3;
						return [data.site_xpos[i], data.site_xpos[i + 1], data.site_xpos[i + 2]];
					}
					return null;
				case 'camera':
					if (data.cam_xpos && sel.id < (model.ncam ?? 0)) {
						const i = sel.id * 3;
						return [data.cam_xpos[i], data.cam_xpos[i + 1], data.cam_xpos[i + 2]];
					}
					return null;
				case 'joint': {
					const bodyId = sim.joints[sel.id]?.bodyId ?? -1;
					if (bodyId >= 0) {
						const i = bodyId * 3;
						return [data.xpos[i], data.xpos[i + 1], data.xpos[i + 2]];
					}
					return null;
				}
				case 'light': {
					const pos = model.light_pos;
					if (pos && sel.id < (model.nlight ?? 0)) {
						const i = sel.id * 3;
						return [pos[i], pos[i + 1], pos[i + 2]];
					}
					return null;
				}
				case 'tendon': {
					// Mid wrap point is a better centre than the first/last endpoint.
					const wrapAdr = model.ten_wrapadr;
					const wrapNum = model.ten_wrapnum;
					if (wrapAdr && wrapNum && data.wrap_xpos && sel.id < (model.ntendon ?? 0)) {
						const adr = wrapAdr[sel.id];
						const num = wrapNum[sel.id];
						if (num > 0) {
							const w = adr + Math.floor(num / 2);
							const i = w * 3;
							return [data.wrap_xpos[i], data.wrap_xpos[i + 1], data.wrap_xpos[i + 2]];
						}
					}
					return null;
				}
				case 'actuator': {
					// Transmission types 0 (joint) / 1 (jointinparent) forward to the
					// driven joint's parent body. Other types need their own focus
					// paths; fall through for now.
					const trnType = model.actuator_trntype?.[sel.id] ?? 0;
					const trnId = model.actuator_trnid?.[2 * sel.id] ?? -1;
					if (trnId >= 0 && (trnType === 0 || trnType === 1)) {
						const bid = model.jnt_bodyid?.[trnId] ?? -1;
						if (bid >= 0) {
							const i = bid * 3;
							return [data.xpos[i], data.xpos[i + 1], data.xpos[i + 2]];
						}
					}
					return null;
				}
				default:
					return null;
			}
		} catch {
			return null;
		}
	}

	/**
	 * Focus on whichever entity the current selection points to. Skips
	 * focus while in tracking mode (the tracker already drives the target)
	 * and auto-applies keyframes instead of focusing, since keyframes don't
	 * have a spatial anchor.
	 */
	followSelection(sim: MujocoSimState, sel: Selection): void {
		if (sim.status !== 'ready') return;
		if (typeof this.mode === 'object' && this.mode.kind === 'track') return;
		if (sel.kind === 'keyframe') {
			if (sel.id >= 0 && sel.id < sim.keyframeNames.length) {
				void sim.api.applyKeyframe(sel.id);
			}
			return;
		}
		const point = this.resolveFocusPoint(sim, sel);
		if (point) this.focusOn(point);
	}
}
