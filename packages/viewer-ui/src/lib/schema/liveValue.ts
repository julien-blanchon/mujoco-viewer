/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-(kind, attr) live-value extractors.
 *
 * When an XML element doesn't explicitly set an attribute (e.g. a geom
 * inherits `pos` from a `<default>` block), the source shows nothing but
 * MuJoCo's compiler has filled in a concrete value via `mjModel` / `mjData`.
 * The editor prefills those inputs with this computed value so users see
 * what they're overriding.
 *
 * Shape: `liveValue(sim, record, attr) -> string | null`
 *   - returns an XML-formatted string (whitespace-separated for vectors)
 *   - null when we don't know how to compute this attribute, or the data
 *     isn't available (engine loading, reload failed, ...)
 *
 * Kept as a flat lookup table keyed by `kind.attr` for easy extension.
 */

import type { EntityKind, MujocoData, MujocoModel, MujocoSimState, XmlEntityRecord } from 'mujoco-svelte';

type LiveFn = (sim: MujocoSimState, record: XmlEntityRecord) => string | null;

function fmt(n: number): string {
	if (!Number.isFinite(n)) return '0';
	// `toPrecision(6)` trims long float tails without losing meaningful digits.
	const s = Number(n.toPrecision(6)).toString();
	return s;
}

// Several MuJoCo typed-array fields are modelled as `unknown` on `MujocoModel`
// (the bindings only have concrete types for the most common ones). We accept
// unknown here and runtime-check that we really got an indexable numeric
// array — the callers pass these through blindly.
type NumArray = ArrayLike<number>;

function asNumArray(v: unknown): NumArray | null {
	if (v == null) return null;
	if (typeof v !== 'object') return null;
	const a = v as NumArray;
	return typeof a.length === 'number' ? a : null;
}

function vec(src: unknown, offset: number, count: number): string | null {
	const arr = asNumArray(src);
	if (!arr || offset < 0 || offset + count > arr.length) return null;
	const parts: string[] = [];
	for (let i = 0; i < count; i++) parts.push(fmt(arr[offset + i]));
	return parts.join(' ');
}

function scalar(src: unknown, index: number): string | null {
	const arr = asNumArray(src);
	if (!arr || index < 0 || index >= arr.length) return null;
	return fmt(arr[index]);
}

function bool(src: unknown, index: number): string | null {
	const arr = asNumArray(src);
	if (!arr || index < 0 || index >= arr.length) return null;
	return arr[index] ? 'true' : 'false';
}

function withModelData<T>(sim: MujocoSimState, cb: (model: MujocoModel, data: MujocoData) => T): T | null {
	const m = sim.mjModel;
	const d = sim.mjData;
	if (!m || !d) return null;
	return cb(m, d);
}

/**
 * The big table. Grouped by kind for readability. Each entry is an extractor
 * that returns the *literal* XML string we'd drop into the attribute.
 *
 * Not every MuJoCo attribute has a live counterpart — `friction`, `solimp`,
 * and most behavioral params are already literal in the XML (no compile-time
 * mutation). Those aren't listed here and fall through to `null`; the editor
 * then shows an empty input (the XML default kicks in if nothing is typed).
 */
const LIVE_VALUE: Partial<Record<EntityKind, Record<string, LiveFn>>> = {
	body: {
		pos: (sim, r) => withModelData(sim, (_m, d) => vec(d.xpos, r.index * 3, 3)),
		quat: (sim, r) => withModelData(sim, (_m, d) => vec(d.xquat, r.index * 4, 4)),
		mass: (sim, r) => withModelData(sim, (m) => scalar(m.body_mass, r.index)),
		gravcomp: (sim, r) => withModelData(sim, (m) => scalar(m.body_gravcomp, r.index)),
		mocap: (sim, r) => withModelData(sim, (m) => bool(m.body_mocapid, r.index))
	},
	geom: {
		pos: (sim, r) => withModelData(sim, (_m, d) => vec(d.geom_xpos, r.index * 3, 3)),
		size: (sim, r) => withModelData(sim, (m) => vec(m.geom_size, r.index * 3, 3)),
		rgba: (sim, r) => withModelData(sim, (m) => vec(m.geom_rgba, r.index * 4, 4)),
		friction: (sim, r) => withModelData(sim, (m) => vec(m.geom_friction, r.index * 3, 3)),
		mass: (sim, r) => withModelData(sim, (m) => scalar(m.body_mass, m.geom_bodyid?.[r.index] ?? -1)),
		contype: (sim, r) => withModelData(sim, (m) => scalar(m.geom_contype, r.index)),
		conaffinity: (sim, r) => withModelData(sim, (m) => scalar(m.geom_conaffinity, r.index)),
		condim: (sim, r) => withModelData(sim, (m) => scalar(m.geom_condim, r.index)),
		group: (sim, r) => withModelData(sim, (m) => scalar(m.geom_group, r.index)),
		priority: (sim, r) => withModelData(sim, (m) => scalar(m.geom_priority, r.index)),
		margin: (sim, r) => withModelData(sim, (m) => scalar(m.geom_margin, r.index)),
		gap: (sim, r) => withModelData(sim, (m) => scalar(m.geom_gap, r.index)),
		solmix: (sim, r) => withModelData(sim, (m) => scalar(m.geom_solmix, r.index)),
		type: (sim, r) => {
			const TYPES = ['plane', 'hfield', 'sphere', 'capsule', 'ellipsoid', 'cylinder', 'box', 'mesh', 'sdf'];
			return withModelData(sim, (m) => {
				const t = m.geom_type?.[r.index];
				return typeof t === 'number' ? TYPES[t] ?? String(t) : null;
			});
		}
	},
	joint: {
		pos: (sim, r) => withModelData(sim, (m) => vec(m.jnt_pos, r.index * 3, 3)),
		axis: (sim, r) => withModelData(sim, (m) => vec(m.jnt_axis, r.index * 3, 3)),
		range: (sim, r) => withModelData(sim, (m) => vec(m.jnt_range, r.index * 2, 2)),
		damping: (sim, r) => withModelData(sim, (m) => scalar(m.dof_damping, m.jnt_dofadr?.[r.index] ?? -1)),
		stiffness: (sim, r) => withModelData(sim, (m) => scalar(m.jnt_stiffness, r.index)),
		armature: (sim, r) => withModelData(sim, (m) => scalar(m.dof_armature, m.jnt_dofadr?.[r.index] ?? -1)),
		frictionloss: (sim, r) =>
			withModelData(sim, (m) => scalar(m.dof_frictionloss, m.jnt_dofadr?.[r.index] ?? -1)),
		limited: (sim, r) => withModelData(sim, (m) => bool(m.jnt_limited, r.index)),
		ref: (sim, r) => withModelData(sim, (m) => scalar(m.qpos0, m.jnt_qposadr?.[r.index] ?? -1)),
		type: (sim, r) => {
			const TYPES = ['free', 'ball', 'slide', 'hinge'];
			return withModelData(sim, (m) => {
				const t = m.jnt_type?.[r.index];
				return typeof t === 'number' ? TYPES[t] ?? String(t) : null;
			});
		}
	},
	site: {
		pos: (sim, r) => withModelData(sim, (_m, d) => vec(d.site_xpos, r.index * 3, 3)),
		size: (sim, r) => withModelData(sim, (m) => vec(m.site_size, r.index * 3, 3)),
		rgba: (sim, r) => withModelData(sim, (m) => vec(m.site_rgba, r.index * 4, 4)),
		group: (sim, r) => withModelData(sim, (m) => scalar(m.site_group, r.index))
	},
	camera: {
		pos: (sim, r) => withModelData(sim, (_m, d) => vec(d.cam_xpos, r.index * 3, 3)),
		fovy: (sim, r) => withModelData(sim, (m) => scalar(m.cam_fovy, r.index)),
		ipd: (sim, r) => withModelData(sim, (m) => scalar(m.cam_ipd, r.index)),
		mode: (sim, r) => {
			const MODES = ['fixed', 'track', 'trackcom', 'targetbody', 'targetbodycom'];
			return withModelData(sim, (m) => {
				const t = m.cam_mode?.[r.index];
				return typeof t === 'number' ? MODES[t] ?? String(t) : null;
			});
		}
	},
	light: {
		pos: (sim, r) => withModelData(sim, (_m, d) => vec(d.light_xpos, r.index * 3, 3)),
		dir: (sim, r) => withModelData(sim, (_m, d) => vec(d.light_xdir, r.index * 3, 3)),
		cutoff: (sim, r) => withModelData(sim, (m) => scalar(m.light_cutoff, r.index)),
		exponent: (sim, r) => withModelData(sim, (m) => scalar(m.light_exponent, r.index)),
		ambient: (sim, r) => withModelData(sim, (m) => vec(m.light_ambient, r.index * 3, 3)),
		diffuse: (sim, r) => withModelData(sim, (m) => vec(m.light_diffuse, r.index * 3, 3)),
		specular: (sim, r) => withModelData(sim, (m) => vec(m.light_specular, r.index * 3, 3)),
		attenuation: (sim, r) => withModelData(sim, (m) => vec(m.light_attenuation, r.index * 3, 3)),
		active: (sim, r) => withModelData(sim, (m) => bool(m.light_active, r.index)),
		castshadow: (sim, r) => withModelData(sim, (m) => bool(m.light_castshadow, r.index)),
		directional: (sim, r) => withModelData(sim, (m) => bool(m.light_directional, r.index))
	},
	material: {
		rgba: (sim, r) => withModelData(sim, (m) => vec(m.mat_rgba, r.index * 4, 4)),
		emission: (sim, r) => withModelData(sim, (m) => scalar(m.mat_emission, r.index)),
		specular: (sim, r) => withModelData(sim, (m) => scalar(m.mat_specular, r.index)),
		shininess: (sim, r) => withModelData(sim, (m) => scalar(m.mat_shininess, r.index)),
		reflectance: (sim, r) => withModelData(sim, (m) => scalar(m.mat_reflectance, r.index)),
		texrepeat: (sim, r) => withModelData(sim, (m) => vec(m.mat_texrepeat, r.index * 2, 2)),
		texuniform: (sim, r) => withModelData(sim, (m) => bool(m.mat_texuniform, r.index))
	},
	tendon: {
		range: (sim, r) => withModelData(sim, (m) => vec(m.tendon_range, r.index * 2, 2)),
		width: (sim, r) => withModelData(sim, (m) => scalar(m.tendon_width, r.index)),
		rgba: (sim, r) => withModelData(sim, (m) => vec(m.tendon_rgba, r.index * 4, 4)),
		limited: (sim, r) => withModelData(sim, (m) => bool(m.tendon_limited, r.index)),
		stiffness: (sim, r) => withModelData(sim, (m) => scalar(m.tendon_stiffness, r.index)),
		damping: (sim, r) => withModelData(sim, (m) => scalar(m.tendon_damping, r.index)),
		frictionloss: (sim, r) => withModelData(sim, (m) => scalar(m.tendon_frictionloss, r.index))
	},
	actuator: {
		gear: (sim, r) => withModelData(sim, (m) => vec(m.actuator_gear, r.index * 6, 6)),
		ctrlrange: (sim, r) => withModelData(sim, (m) => vec(m.actuator_ctrlrange, r.index * 2, 2)),
		forcerange: (sim, r) => withModelData(sim, (m) => vec(m.actuator_forcerange, r.index * 2, 2)),
		actrange: (sim, r) => withModelData(sim, (m) => vec(m.actuator_actrange, r.index * 2, 2)),
		ctrllimited: (sim, r) => withModelData(sim, (m) => bool(m.actuator_ctrllimited, r.index)),
		forcelimited: (sim, r) => withModelData(sim, (m) => bool(m.actuator_forcelimited, r.index)),
		actlimited: (sim, r) => withModelData(sim, (m) => bool(m.actuator_actlimited, r.index)),
		gainprm: (sim, r) => withModelData(sim, (m) => vec(m.actuator_gainprm, r.index * 10, 10)),
		biasprm: (sim, r) => withModelData(sim, (m) => vec(m.actuator_biasprm, r.index * 10, 10)),
		dynprm: (sim, r) => withModelData(sim, (m) => vec(m.actuator_dynprm, r.index * 10, 10))
	},
	sensor: {
		cutoff: (sim, r) => withModelData(sim, (m) => scalar(m.sensor_cutoff, r.index)),
		noise: (sim, r) => withModelData(sim, (m) => scalar(m.sensor_noise, r.index))
	}
};

export function liveValueFor(
	sim: MujocoSimState,
	record: XmlEntityRecord,
	attr: string
): string | null {
	const byKind = LIVE_VALUE[record.kind];
	const fn = byKind?.[attr];
	if (!fn) return null;
	try {
		return fn(sim, record);
	} catch {
		return null;
	}
}
