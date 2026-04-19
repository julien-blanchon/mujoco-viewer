/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reactive, theme-derived colours for scene elements that should track the
 * host UI (DefaultSkybox, DefaultFloor, …).
 *
 * The editor background is read through a throwaway DOM element so any CSS
 * colour syntax — `oklch(...)`, `var(...)` chains, plain hex — ends up as
 * `rgb(r, g, b)` via `getComputedStyle`, which `THREE.Color.set()` accepts.
 * Derived colours are shifted in HSL so the 3D scene never tonally collides
 * with the UI surfaces (that would make robot geometry hard to read).
 *
 * Exposed as `$state` hex strings so consumers can pass them straight to
 * Threlte material props — Threlte patches them reactively. For shader
 * uniforms, mutate a stable `THREE.Color` inside an `$effect` that reads
 * the hex state.
 */

import * as THREE from 'three';

function resolveCssColor(cssExpr: string): string | null {
	if (typeof document === 'undefined') return null;
	const el = document.createElement('div');
	el.style.position = 'absolute';
	el.style.visibility = 'hidden';
	el.style.pointerEvents = 'none';
	el.style.color = cssExpr;
	document.body.appendChild(el);
	const rgb = getComputedStyle(el).color;
	el.remove();
	return rgb || null;
}

function detectDark(): boolean {
	if (typeof document === 'undefined') return true;
	return (
		document.documentElement.classList.contains('dark') ||
		document.body.classList.contains('vscode-dark') ||
		(document.body.classList.contains('vscode-high-contrast') &&
			!document.body.classList.contains('vscode-high-contrast-light'))
	);
}

/** Reactive colour palette derived from the host theme. */
export class ThemeColors {
	isDark = $state(true);
	/** Sky colour just above the horizon. Hex like `#rrggbb`. */
	skyTop = $state('#1e2129');
	/** Sky colour just below the horizon / at the bottom edge. */
	skyBottom = $state('#0a0d12');
	/** Floor plane colour. */
	floor = $state('#9ca3af');

	#disposers: Array<() => void> = [];
	#base = new THREE.Color();
	#scratch = new THREE.Color();

	constructor() {
		this.#recompute();
		if (typeof document !== 'undefined') {
			const mo1 = new MutationObserver(() => this.#recompute());
			mo1.observe(document.body, { attributes: true, attributeFilter: ['class'] });
			this.#disposers.push(() => mo1.disconnect());
			const mo2 = new MutationObserver(() => this.#recompute());
			mo2.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});
			this.#disposers.push(() => mo2.disconnect());
		}
	}

	dispose(): void {
		for (const d of this.#disposers) d();
		this.#disposers = [];
	}

	#recompute(): void {
		const dark = detectDark();
		this.isDark = dark;

		// Prefer VSCode's editor background so the scene tracks extension theme
		// flips; fall back to shadcn's `--background` token which the debug app
		// sets via oklch values.
		const resolved =
			resolveCssColor('var(--vscode-editor-background)') ??
			resolveCssColor('var(--background)');

		if (resolved) {
			this.#base.set(resolved);
		} else {
			this.#base.set(dark ? '#1e1e1e' : '#f8fafc');
		}

		// We borrow only the *hue* from the editor background — its lightness
		// can be pinned to 0 / 1 in themes like Default Dark+ or GitHub Light,
		// which would produce pure-black / pure-white sky and floor. Instead
		// pick absolute HSL targets in a soft mid range so the scene stays
		// legible regardless of how extreme the editor bg is. Saturation is
		// kept low (< 0.12) so the sky is neutral-coloured, not cartoony.
		const hsl = { h: 0, s: 0, l: 0 };
		this.#base.getHSL(hsl);
		// If the base has no saturation, use a neutral hue; a pure white/black
		// editor-bg otherwise maps to `h=0` (red) which tints the sky pink.
		const hue = hsl.s < 0.02 ? 0.6 : hsl.h;

		if (dark) {
			this.#scratch.setHSL(hue, 0.1, 0.22);
			this.skyTop = `#${this.#scratch.getHexString()}`;
			this.#scratch.setHSL(hue, 0.06, 0.12);
			this.skyBottom = `#${this.#scratch.getHexString()}`;
			this.#scratch.setHSL(hue, 0.04, 0.28);
			this.floor = `#${this.#scratch.getHexString()}`;
		} else {
			this.#scratch.setHSL(hue, 0.09, 0.86);
			this.skyTop = `#${this.#scratch.getHexString()}`;
			this.#scratch.setHSL(hue, 0.05, 0.92);
			this.skyBottom = `#${this.#scratch.getHexString()}`;
			this.#scratch.setHSL(hue, 0.04, 0.74);
			this.floor = `#${this.#scratch.getHexString()}`;
		}
	}
}
