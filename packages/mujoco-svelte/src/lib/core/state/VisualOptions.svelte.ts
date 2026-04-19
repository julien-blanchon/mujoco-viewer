/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * VisualOptions — reactive mjvOption / mjvScene.flags mirror.
 *
 * This is the single source of truth for "what does the user want to see".
 * Debug overlays, the options panel, and the renderer all read from one
 * instance. Mirrors MuJoCo's `mjvOption` layout where practical:
 *
 *   - `vis.*`       → per-element visibility (mjVIS_*)
 *   - `render.*`    → render feature flags (mjRND_*)
 *   - `groups.*`    → per-group visibility arrays (geom/site/joint/tendon/actuator)
 *   - `frame`       → frame axes overlay (mjFRAME_*)
 *   - `label`       → label overlay (mjLABEL_*)
 *   - `scale.*`     → overlay scaling factors (force arrows, frames, ...)
 *
 * Consumers call `useVisualOptions()` to read. If no provider is mounted,
 * debug components fall back to their own props — VisualOptions is always
 * opt-in.
 */

import { getContext, setContext } from 'svelte';

export const VISUAL_OPTIONS_KEY: unique symbol = Symbol('mujoco-svelte:visual-options');

export type FrameMode = 'none' | 'body' | 'geom' | 'site' | 'world' | 'com' | 'contact';
export type LabelMode =
	| 'none'
	| 'body'
	| 'joint'
	| 'geom'
	| 'site'
	| 'camera'
	| 'light'
	| 'tendon'
	| 'actuator'
	| 'sensor'
	| 'contact'
	| 'selection';

/** Six-slot group visibility bitset, matching MuJoCo's `geomgroup[6]`, etc. */
export type GroupVisibility = [boolean, boolean, boolean, boolean, boolean, boolean];

const ALL_GROUPS: GroupVisibility = [true, true, true, true, true, true];

export class VisualOptions {
	// ---- Element visibility (mjVIS_*) ----
	vis = $state({
		actuator: false,
		light: true,
		camera: true,
		tendon: true,
		joint: true,
		com: true,
		inertia: false,
		contactPoint: false,
		contactForce: false,
		transparent: false,
		perturbForce: false,
		perturbObject: false,
		rangefinder: false,
		constraint: false,
		autoconnect: true,
		island: false,
		selection: true,
		staticBody: true,
		skin: true,
		flexvert: true,
		flexedge: true,
		flexface: true,
		flexskin: true
	});

	// ---- Render flags (mjRND_* + viewer-only extras) ----
	render = $state({
		shadow: false,
		reflection: false,
		skybox: false,
		wireframe: false,
		fog: false,
		haze: false,
		segment: false,
		idcolor: false,
		cull: false,
		/** Draw an infinite-looking default floor plane at z≈0 when the model
		 * doesn't define one. Sits at z=-0.002 so MJCF floor geoms win via
		 * the depth test when they exist. Viewer-only — has no mjRND_
		 * equivalent. */
		defaultFloor: true,
		/** Render a subtle theme-aware gradient behind the scene. Sits at the
		 * very back (renderOrder=-999, depthTest=false) so it doesn't fight
		 * the MJCF skybox or debug overlays. Viewer-only. */
		defaultSkybox: true
	});

	// ---- Per-group visibility (mjvOption.geomgroup[6], sitegroup[6], ...) ----
	groups = $state({
		geom: [...ALL_GROUPS] as GroupVisibility,
		site: [...ALL_GROUPS] as GroupVisibility,
		joint: [...ALL_GROUPS] as GroupVisibility,
		tendon: [...ALL_GROUPS] as GroupVisibility,
		actuator: [...ALL_GROUPS] as GroupVisibility,
		/** Skin groups (mjvOption.skingroup). */
		skin: [...ALL_GROUPS] as GroupVisibility,
		/** Flex groups (mjvOption.flexgroup). */
		flex: [...ALL_GROUPS] as GroupVisibility
	});

	// ---- Frame / label overlays ----
	frame = $state<FrameMode>('none');
	label = $state<LabelMode>('none');

	// ---- Overlay scales ----
	scale = $state({
		/** Contact-force arrow scale (world units per Newton). */
		contactForce: 0.1,
		/** Perturbation arrow scale. */
		perturbForce: 0.1,
		/** Frame axis length (world units). */
		frame: 0.1,
		/** Actuator arrow scale. */
		actuator: 0.05,
		/** Rangefinder ray length clamp. */
		rangefinder: 10,
		/** Com marker radius. */
		com: 0.02,
		/** Joint marker scale. */
		joint: 0.05
	});

	/** Global opacity applied when `vis.transparent` is on. */
	transparentAlpha = $state(0.35);
}

/** Provide a VisualOptions instance to descendants. Returns the instance. */
export function provideVisualOptions(instance?: VisualOptions): VisualOptions {
	const value = instance ?? new VisualOptions();
	setContext(VISUAL_OPTIONS_KEY, value);
	return value;
}

/**
 * Read the ambient VisualOptions. Returns null if no provider is mounted,
 * letting debug components fall back to their own props.
 */
export function useVisualOptions(): VisualOptions | null {
	return getContext<VisualOptions | undefined>(VISUAL_OPTIONS_KEY) ?? null;
}
