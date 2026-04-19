/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fly-style keyboard navigation layered on top of `CameraController`.
 *
 * We keep `OrbitControls` as the primary camera rig (its damping + pinch /
 * wheel zoom + pivot-around-target behaviour is exactly what users expect in
 * a 3D editor). WASD / arrow keys simply *pan the pivot*: the camera and
 * orbit target translate together in lockstep, so the view direction is
 * preserved and the orbit rig stays coherent afterwards.
 *
 * Design notes:
 *   - Integrates per-frame via `requestAnimationFrame`; the last frame's
 *     `delta` is used so speed stays consistent across refresh rates.
 *   - Speed scales with the scene's `lastFrame.distance` so tiny robots and
 *     warehouse-sized scenes feel equivalent. `shift` boosts 4×; `alt`/`ctrl`
 *     slows by 3× for fine adjustments.
 *   - `INPUT` / `TEXTAREA` / `contenteditable` targets are always ignored so
 *     the scene controls never steal characters from a panel input.
 *   - Arrow / Page keys additionally yield when a non-canvas UI element has
 *     focus (scene tree row, menu, button, …) so users can navigate panels
 *     with the same keys they'd navigate the 3D view. WASD / Q / E stay
 *     active everywhere outside form inputs — those keys have no native
 *     UI semantic, so claiming them is always safe.
 *   - When the camera is in `fixed` mode (driving from an MJCF `<camera>`),
 *     pan input is swallowed — OrbitControls is disabled in that mode and
 *     the simulated pose owns the view.
 */
import type { CameraController } from './cameraController.svelte.js';

/** Tunables that callers can thread through from host settings. Resolved
 *  fresh on every frame via the getter, so live setting changes take effect
 *  without reinstalling listeners. */
export type FlyControlsTunables = () => {
	flySpeed: number;
	boostMultiplier: number;
	slowDivisor: number;
	invertY: boolean;
};

type Axis = 'right' | 'up' | 'forward';

const KEY_TO_AXIS: Record<string, { axis: Axis; sign: 1 | -1 }> = {
	KeyW: { axis: 'forward', sign: 1 },
	KeyS: { axis: 'forward', sign: -1 },
	KeyA: { axis: 'right', sign: -1 },
	KeyD: { axis: 'right', sign: 1 },
	KeyQ: { axis: 'up', sign: -1 },
	KeyE: { axis: 'up', sign: 1 },
	ArrowUp: { axis: 'forward', sign: 1 },
	ArrowDown: { axis: 'forward', sign: -1 },
	ArrowLeft: { axis: 'right', sign: -1 },
	ArrowRight: { axis: 'right', sign: 1 },
	PageUp: { axis: 'up', sign: 1 },
	PageDown: { axis: 'up', sign: -1 }
};

function isFormTarget(target: EventTarget | null): boolean {
	if (!target) return false;
	const el = target as HTMLElement;
	const tag = el.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if (el.isContentEditable) return true;
	return false;
}

/** True when focus sits on any interactive UI element that isn't the canvas
 *  or the document body — i.e. somewhere the app's own keyboard semantics
 *  (tree rows, buttons, menus, tabs) should win over world navigation. We
 *  check the active element rather than the event target so focus-after-
 *  click still yields even when the keydown propagates from `document`. */
function hasUiFocus(target: EventTarget | null): boolean {
	const el = (target as HTMLElement | null) ?? document.activeElement;
	if (!el || el === document.body) return false;
	const tag = (el as HTMLElement).tagName;
	if (tag === 'HTML' || tag === 'BODY' || tag === 'CANVAS') return false;
	return true;
}

const DEFAULT_TUNABLES: FlyControlsTunables = () => ({
	flySpeed: 0.6,
	boostMultiplier: 4,
	slowDivisor: 3,
	invertY: false
});

/** Install keyboard fly-controls on `window`. Returns a teardown. */
export function installCameraFlyControls(
	camera: CameraController,
	tunables: FlyControlsTunables = DEFAULT_TUNABLES
): () => void {
	const pressed = new Set<string>();
	let boost = false;
	let slow = false;
	let lastTs = 0;
	let rafId = 0;

	function axisInput(axis: Axis): number {
		let v = 0;
		for (const code of pressed) {
			const m = KEY_TO_AXIS[code];
			if (m && m.axis === axis) v += m.sign;
		}
		return Math.sign(v);
	}

	function tick(now: number) {
		rafId = requestAnimationFrame(tick);
		const dt = lastTs > 0 ? Math.min(0.1, (now - lastTs) / 1000) : 0;
		lastTs = now;
		if (dt <= 0) return;
		if (pressed.size === 0) return;
		if (!camera.orbitEnabled) return;

		// Speed: 1× scene-radius per second at boost=1. We infer "scene radius"
		// from the last AutoFrame distance (≈ diagonal × 0.9); fall back to a
		// sane constant before the sim loads.
		const t = tunables();
		const sceneRadius = camera.lastFrame?.distance ?? 2;
		let speed = sceneRadius * t.flySpeed * dt;
		if (boost) speed *= t.boostMultiplier;
		if (slow) speed /= t.slowDivisor;

		const x = axisInput('right') * speed;
		const yRaw = axisInput('up') * speed;
		const y = t.invertY ? -yRaw : yRaw;
		const z = axisInput('forward') * speed;
		if (x || y || z) camera.pan(x, y, z);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (isFormTarget(e.target)) return;
		// Plain modifier press → update boost/slow, let other handlers see the
		// event. We intentionally don't return early because the user might
		// hold shift *before* pressing the movement key.
		if (e.key === 'Shift') boost = true;
		if (e.key === 'Alt' || e.key === 'Control') slow = true;

		const mapping = KEY_TO_AXIS[e.code];
		if (!mapping) return;

		// Arrow / Page keys are the only world-nav keys that collide with
		// native UI navigation (tree rows, menus, tabs). Yield when focus is
		// on a UI element so the panel gets to move its own cursor.
		const isArrowish = e.code.startsWith('Arrow') || e.code.startsWith('Page');
		if (isArrowish && hasUiFocus(e.target)) return;

		// Arrow keys otherwise scroll the outer page / jump focus; claim them.
		if (isArrowish) e.preventDefault();
		pressed.add(e.code);
	}

	function onKeyUp(e: KeyboardEvent) {
		if (e.key === 'Shift') boost = false;
		if (e.key === 'Alt' || e.key === 'Control') slow = false;
		pressed.delete(e.code);
	}

	function onBlur() {
		pressed.clear();
		boost = false;
		slow = false;
	}

	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	window.addEventListener('blur', onBlur);
	rafId = requestAnimationFrame(tick);

	return () => {
		cancelAnimationFrame(rafId);
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('keyup', onKeyUp);
		window.removeEventListener('blur', onBlur);
	};
}
