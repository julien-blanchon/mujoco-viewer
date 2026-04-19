/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI metadata layered on top of `mujoco.xsd`.
 *
 * The XSD knows the *type* of each attribute (int, float, enum, real-vector,
 * ...). It doesn't know how the editor should *present* them — what group
 * they belong to, whether they should be hidden, a human-friendly label, etc.
 * That's purely a UX concern and lives here, outside the schema.
 *
 * We deliberately keep this separate from the XSD (rather than editing the
 * ~130 KB auto-generated file with `xs:annotation`/`xs:appinfo` blocks).
 * If MuJoCo ships a newer XSD, it drops straight in; we only need to update
 * this file when the UI wants to reshape the editor.
 */

export type AttrGroup =
	| 'Identification'
	| 'Transform'
	| 'Shape'
	| 'Appearance'
	| 'Physics'
	| 'Behavior'
	| 'Limits'
	| 'Defaults'
	| 'Misc';

export interface AttrUIMeta {
	group: AttrGroup;
	/** Friendlier label. If omitted the raw attr name is used. */
	label?: string;
	/** Help text shown on hover. */
	help?: string;
	/** Don't show in the auto-rendered attribute list. */
	hidden?: boolean;
}

/**
 * Universal metadata keyed by attribute name. Most MuJoCo attributes have
 * stable semantics across elements (`pos` means position everywhere), so a
 * flat map is plenty — we only need per-element overrides for the handful of
 * cases where the name is overloaded.
 */
export const ATTR_META: Record<string, AttrUIMeta> = {
	// ---- Identification ----
	name: { group: 'Identification', label: 'Name', hidden: true }, // handled by EntityHeader
	class: { group: 'Defaults', label: 'Class' },
	childclass: { group: 'Defaults', label: 'Child class' },

	// ---- Transform ----
	pos: { group: 'Transform', label: 'Position' },
	quat: { group: 'Transform', label: 'Quaternion' },
	euler: { group: 'Transform', label: 'Euler (deg)' },
	axisangle: { group: 'Transform', label: 'Axis-angle' },
	xyaxes: { group: 'Transform', label: 'XY axes' },
	zaxis: { group: 'Transform', label: 'Z axis' },
	fromto: { group: 'Transform', label: 'From→to' },
	dir: { group: 'Transform', label: 'Direction' },
	axis: { group: 'Transform', label: 'Axis' },
	target: { group: 'Transform', label: 'Target' },

	// ---- Shape ----
	type: { group: 'Shape', label: 'Type' },
	size: { group: 'Shape', label: 'Size' },
	mesh: { group: 'Shape', label: 'Mesh' },
	hfield: { group: 'Shape', label: 'Height field' },
	fitscale: { group: 'Shape', label: 'Fit scale' },
	builtin: { group: 'Shape', label: 'Builtin' },
	content_type: { group: 'Shape', label: 'Content type' },

	// ---- Appearance ----
	rgba: { group: 'Appearance', label: 'RGBA' },
	rgb1: { group: 'Appearance', label: 'Color 1' },
	rgb2: { group: 'Appearance', label: 'Color 2' },
	material: { group: 'Appearance', label: 'Material' },
	texture: { group: 'Appearance', label: 'Texture' },
	emission: { group: 'Appearance', label: 'Emission' },
	specular: { group: 'Appearance', label: 'Specular' },
	shininess: { group: 'Appearance', label: 'Shininess' },
	reflectance: { group: 'Appearance', label: 'Reflectance' },
	texrepeat: { group: 'Appearance', label: 'Texture repeat' },
	texuniform: { group: 'Appearance', label: 'Texture uniform' },
	width: { group: 'Appearance', label: 'Width' },
	height: { group: 'Appearance', label: 'Height' },
	markrgb: { group: 'Appearance', label: 'Mark color' },
	random: { group: 'Appearance', label: 'Random' },
	mark: { group: 'Appearance', label: 'Mark' },
	group: { group: 'Appearance', label: 'Group' },

	// ---- Physics ----
	mass: { group: 'Physics', label: 'Mass' },
	density: { group: 'Physics', label: 'Density' },
	diaginertia: { group: 'Physics', label: 'Diag inertia' },
	fullinertia: { group: 'Physics', label: 'Full inertia' },
	gravcomp: { group: 'Physics', label: 'Grav comp' },
	friction: { group: 'Physics', label: 'Friction' },
	frictionloss: { group: 'Physics', label: 'Friction loss' },
	solimp: { group: 'Physics', label: 'Solimp' },
	solref: { group: 'Physics', label: 'Solref' },
	solmix: { group: 'Physics', label: 'Solmix' },
	solimplimit: { group: 'Physics', label: 'Solimp limit' },
	solreflimit: { group: 'Physics', label: 'Solref limit' },
	solimpfriction: { group: 'Physics', label: 'Solimp friction' },
	solreffriction: { group: 'Physics', label: 'Solref friction' },
	margin: { group: 'Physics', label: 'Margin' },
	gap: { group: 'Physics', label: 'Gap' },
	shellinertia: { group: 'Physics', label: 'Shell inertia' },
	fluidshape: { group: 'Physics', label: 'Fluid shape' },
	fluidcoef: { group: 'Physics', label: 'Fluid coef' },
	contype: { group: 'Physics', label: 'Contact type' },
	conaffinity: { group: 'Physics', label: 'Contact affinity' },
	condim: { group: 'Physics', label: 'Contact dims' },
	priority: { group: 'Physics', label: 'Contact priority' },
	armature: { group: 'Physics', label: 'Armature' },
	damping: { group: 'Physics', label: 'Damping' },
	stiffness: { group: 'Physics', label: 'Stiffness' },
	springdamper: { group: 'Physics', label: 'Spring damper' },
	springref: { group: 'Physics', label: 'Spring ref' },
	ref: { group: 'Physics', label: 'Reference' },

	// ---- Behavior / limits ----
	limited: { group: 'Limits', label: 'Limited' },
	range: { group: 'Limits', label: 'Range' },
	ctrllimited: { group: 'Limits', label: 'Ctrl limited' },
	ctrlrange: { group: 'Limits', label: 'Ctrl range' },
	forcelimited: { group: 'Limits', label: 'Force limited' },
	forcerange: { group: 'Limits', label: 'Force range' },
	actlimited: { group: 'Limits', label: 'Act limited' },
	actrange: { group: 'Limits', label: 'Act range' },
	actuatorfrclimited: { group: 'Limits', label: 'Act-force limited' },
	actuatorfrcrange: { group: 'Limits', label: 'Act-force range' },
	actuatorgravcomp: { group: 'Behavior', label: 'Act grav comp' },

	// ---- Behavior ----
	mocap: { group: 'Behavior', label: 'Mocap' },
	mode: { group: 'Behavior', label: 'Mode' },
	gear: { group: 'Behavior', label: 'Gear' },
	dyntype: { group: 'Behavior', label: 'Dynamics type' },
	gaintype: { group: 'Behavior', label: 'Gain type' },
	biastype: { group: 'Behavior', label: 'Bias type' },
	dynprm: { group: 'Behavior', label: 'Dynamics params' },
	gainprm: { group: 'Behavior', label: 'Gain params' },
	biasprm: { group: 'Behavior', label: 'Bias params' },
	kp: { group: 'Behavior', label: 'Kp' },
	kv: { group: 'Behavior', label: 'Kv' },
	inheritrange: { group: 'Behavior', label: 'Inherit range' },
	tendon: { group: 'Behavior', label: 'Tendon' },
	joint: { group: 'Behavior', label: 'Joint' },
	jointinparent: { group: 'Behavior', label: 'Joint in parent' },
	slidersite: { group: 'Behavior', label: 'Slider site' },
	cranksite: { group: 'Behavior', label: 'Crank site' },
	cranklength: { group: 'Behavior', label: 'Crank length' },
	site: { group: 'Behavior', label: 'Site' },
	body: { group: 'Behavior', label: 'Body' },
	body1: { group: 'Behavior', label: 'Body 1' },
	body2: { group: 'Behavior', label: 'Body 2' },
	geom1: { group: 'Behavior', label: 'Geom 1' },
	geom2: { group: 'Behavior', label: 'Geom 2' },
	site1: { group: 'Behavior', label: 'Site 1' },
	site2: { group: 'Behavior', label: 'Site 2' },

	// ---- Camera/light specific ----
	fovy: { group: 'Behavior', label: 'FOV' },
	ipd: { group: 'Behavior', label: 'IPD' },
	resolution: { group: 'Behavior', label: 'Resolution' },
	focal: { group: 'Behavior', label: 'Focal' },
	principal: { group: 'Behavior', label: 'Principal' },
	sensorsize: { group: 'Behavior', label: 'Sensor size' },
	directional: { group: 'Behavior', label: 'Directional' },
	castshadow: { group: 'Behavior', label: 'Cast shadow' },
	active: { group: 'Behavior', label: 'Active' },
	attenuation: { group: 'Behavior', label: 'Attenuation' },
	cutoff: { group: 'Behavior', label: 'Cutoff' },
	exponent: { group: 'Behavior', label: 'Exponent' },
	ambient: { group: 'Appearance', label: 'Ambient' },
	diffuse: { group: 'Appearance', label: 'Diffuse' },
	bulbradius: { group: 'Appearance', label: 'Bulb radius' },
	intensity: { group: 'Appearance', label: 'Intensity' },

	// ---- Misc ----
	user: { group: 'Misc', label: 'User data' },
	file: { group: 'Misc', label: 'File' },
	scale: { group: 'Misc', label: 'Scale' },
	refpos: { group: 'Misc', label: 'Ref pos' },
	refquat: { group: 'Misc', label: 'Ref quat' },
	vertex: { group: 'Misc', label: 'Vertex' },
	normal: { group: 'Misc', label: 'Normal' },
	texcoord: { group: 'Misc', label: 'Texcoord' },
	face: { group: 'Misc', label: 'Face' }
};

const GROUP_ORDER: readonly AttrGroup[] = [
	'Identification',
	'Transform',
	'Shape',
	'Appearance',
	'Physics',
	'Limits',
	'Behavior',
	'Defaults',
	'Misc'
];

export function metaFor(attr: string): AttrUIMeta {
	return ATTR_META[attr] ?? { group: 'Misc' };
}

/**
 * Attribute groups where at most one member may be present on an element at
 * any time. MJCF rejects the compile if two are set together (e.g. both
 * `axisangle` and `euler` on a body → "orientation overspecified"), so the
 * edit session treats these as mutually exclusive: staging a setAttr for
 * one member also stages removeAttr for the others currently on the element.
 *
 * The UI consolidates each group into a single "Orientation / Inertia / …"
 * row with a representation picker — only the active member's value field
 * is shown, switching auto-clears the old member.
 *
 * Not exhaustive — only the groups we've observed users trip over. Extend as
 * new mutex pairs surface.
 */
export interface MutexGroupMeta {
	/** Stable key used internally (e.g. 'orientation'). */
	key: string;
	/** Human-readable label shown as the row label in AttrEditList. */
	label: string;
	/** Ordered members. First member is the "preferred" default when none is set. */
	members: readonly string[];
	/** Sensible seed value per member — used when switching representations
	 *  in case the runtime value isn't available for the new member. */
	defaults: Readonly<Record<string, string>>;
}

export const MUTEX_GROUPS: readonly MutexGroupMeta[] = [
	{
		key: 'orientation',
		label: 'Orientation',
		members: ['quat', 'axisangle', 'euler', 'xyaxes', 'zaxis'],
		defaults: {
			quat: '1 0 0 0',
			axisangle: '1 0 0 0',
			euler: '0 0 0',
			xyaxes: '1 0 0 0 1 0',
			zaxis: '0 0 1'
		}
	},
	{
		key: 'inertia',
		label: 'Inertia',
		members: ['diaginertia', 'fullinertia'],
		defaults: {
			diaginertia: '1 1 1',
			fullinertia: '1 1 1 0 0 0'
		}
	}
];

/** Map attr → its mutex group (if any). Precomputed for O(1) lookup. */
const MUTEX_BY_ATTR: Map<string, MutexGroupMeta> = (() => {
	const m = new Map<string, MutexGroupMeta>();
	for (const g of MUTEX_GROUPS) for (const attr of g.members) m.set(attr, g);
	return m;
})();

/**
 * Return the other members of the mutex group `attr` belongs to, or an empty
 * array if `attr` isn't in any group. Stable output order (group definition
 * order) so repeated calls produce identical staging.
 */
export function mutexSiblingsOf(attr: string): readonly string[] {
	const g = MUTEX_BY_ATTR.get(attr);
	if (!g) return [];
	return g.members.filter((a) => a !== attr);
}

/** Lookup the mutex group `attr` belongs to (or null). */
export function mutexGroupOf(attr: string): MutexGroupMeta | null {
	return MUTEX_BY_ATTR.get(attr) ?? null;
}

/**
 * Co-requirements: setting attribute X is only valid if the listed companions
 * are also present on the element. Keyed by (tagName, attr) so "camera.focal"
 * can require `sensorsize` without triggering for any other element type that
 * happens to accept a `focal` attribute.
 *
 * Compile rejections this catches:
 *  - `camera.principal` without `sensorsize` → mjXError (image-centre is
 *    meaningless without physical sensor dims)
 *  - `camera.focalpixel` without `sensorsize` + `resolution` → mjXError
 *  - `camera.focal` without `sensorsize` → mjXError
 */
export const ATTR_REQUIRES: Readonly<
	Record<string, Readonly<Record<string, readonly string[]>>>
> = {
	camera: {
		principal: ['sensorsize'],
		focal: ['sensorsize'],
		focalpixel: ['sensorsize', 'resolution']
	}
};

/**
 * Return the attributes that must already be set on this element before
 * `attr` can be accepted by MuJoCo. Empty array means "no prerequisites".
 */
export function attrRequires(tagName: string, attr: string): readonly string[] {
	return ATTR_REQUIRES[tagName]?.[attr] ?? [];
}

/**
 * Kinds of entities that can be referenced by name from within the MJCF.
 * Mirrors the relevant *Info[] lists on `MujocoSimState` (bodies, joints,
 * geoms, sites, cameras, lights, materials, textures, meshes, tendons,
 * actuators). `class` is handled separately (no sim-level list today).
 */
export type NameRefKind =
	| 'body'
	| 'geom'
	| 'joint'
	| 'site'
	| 'camera'
	| 'light'
	| 'material'
	| 'texture'
	| 'mesh'
	| 'tendon'
	| 'actuator';

export interface NameRefMeta {
	kinds: readonly NameRefKind[];
}

/**
 * Attributes whose value is the name of another entity — the editor turns
 * these into typed dropdowns (NameRefField) instead of free-text inputs so
 * users can't fat-finger a name that doesn't resolve (e.g. the user's
 * `light.target="floor"` case where no body was named "floor").
 *
 * Keyed by (tagName, attr). Multiple entity kinds allow attrs like
 * `camera.target` where either a body or a geom is accepted.
 */
const NAME_REF_ATTRS: Readonly<Record<string, Readonly<Record<string, NameRefMeta>>>> = {
	// Geom / site asset references.
	geom: {
		material: { kinds: ['material'] },
		mesh: { kinds: ['mesh'] },
		hfield: { kinds: ['mesh'] }
	},
	site: {
		material: { kinds: ['material'] }
	},
	// Light / camera tracking target — either a body (com / frame) or a geom.
	light: {
		target: { kinds: ['body', 'geom'] }
	},
	camera: {
		target: { kinds: ['body', 'geom'] }
	},
	// Material ← texture asset reference.
	material: {
		texture: { kinds: ['texture'] }
	}
};

// Actuators share the same set of name-ref attrs across every tag (motor,
// position, velocity, general, muscle, damper, cylinder, intvelocity,
// adhesion, plugin). Expand once here rather than repeating each map.
const ACTUATOR_TAGS = [
	'motor',
	'position',
	'velocity',
	'general',
	'muscle',
	'damper',
	'cylinder',
	'intvelocity',
	'adhesion',
	'plugin'
] as const;
const ACTUATOR_NAME_REFS: Readonly<Record<string, NameRefMeta>> = {
	joint: { kinds: ['joint'] },
	jointinparent: { kinds: ['joint'] },
	tendon: { kinds: ['tendon'] },
	site: { kinds: ['site'] },
	body: { kinds: ['body'] },
	refsite: { kinds: ['site'] },
	cranksite: { kinds: ['site'] },
	slidersite: { kinds: ['site'] }
};
for (const tag of ACTUATOR_TAGS) {
	(NAME_REF_ATTRS as Record<string, Record<string, NameRefMeta>>)[tag] = { ...ACTUATOR_NAME_REFS };
}

/**
 * Lookup the name-ref metadata for (tagName, attr), or null if this attribute
 * is plain string / numeric / not a reference. Callers should fall back to a
 * regular StringField when null.
 */
export function nameRefFor(tagName: string, attr: string): NameRefMeta | null {
	return NAME_REF_ATTRS[tagName]?.[attr] ?? null;
}

// ---- Type-gated attribute visibility + dynamic shapes ----
//
// Several MJCF attributes only make sense for specific values of another
// attribute on the same element. E.g.:
//  - `geom.mesh` is only used when `geom.type="mesh"` — showing a free-text
//    "mesh" field on a capsule just lets users type a name that'll be
//    ignored (or crash).
//  - `geom.size` carries 1 / 2 / 3 values depending on `geom.type`.
//  - `joint.range` is only meaningful for 1-DOF joints AND when
//    `joint.limited` is true / auto.
// Encoding these rules here lets AttrEditList hide the irrelevant fields
// and render dynamic-count vectors with the right slot count.

type AttrCtx = Readonly<Record<string, string | undefined>>;

/** Predicate type: "should we show this attr given the current attrs?" */
type VisibilityRule = (attrs: AttrCtx) => boolean;

const VISIBILITY_RULES: Readonly<Record<string, Readonly<Record<string, VisibilityRule>>>> = {
	geom: {
		// Asset refs only make sense for their geom types. Default type is
		// 'sphere' when omitted.
		mesh: (a) => a.type === 'mesh',
		hfield: (a) => a.type === 'hfield',
		fitscale: (a) => a.type === 'mesh',
		// fromto replaces pos+orientation for capsules / cylinders / boxes /
		// ellipsoids. Hiding it on sphere / plane / mesh / hfield avoids the
		// user setting a fromto that MuJoCo silently ignores.
		fromto: (a) =>
			a.type === 'capsule' ||
			a.type === 'cylinder' ||
			a.type === 'box' ||
			a.type === 'ellipsoid'
	},
	joint: {
		// Ball / free joints don't use an axis or a 1-D range. Hinge/slide do;
		// default type is 'hinge' per MJCF.
		axis: (a) => isOneDofJoint(a.type),
		range: (a) => isOneDofJoint(a.type) && isLimited(a.limited),
		springref: (a) => isOneDofJoint(a.type)
	},
	camera: {
		// `target` only applies in body-target modes.
		target: (a) => a.mode === 'targetbody' || a.mode === 'targetbodycom'
	},
	light: {
		target: (a) => a.mode === 'targetbody' || a.mode === 'targetbodycom'
	}
};

function isOneDofJoint(type: string | undefined): boolean {
	const t = type ?? 'hinge';
	return t === 'hinge' || t === 'slide';
}

function isLimited(limited: string | undefined): boolean {
	return limited === 'true' || limited === 'auto';
}

/**
 * Flatten an XmlEntityRecord's attrs into a plain `{ name: value }` map the
 * visibility rules can consume. Call once per record and thread through the
 * attr loop — far cheaper than re-building per attr.
 */
export function attrCtxOf(attrs: Iterable<[string, { value: string }]>): AttrCtx {
	const out: Record<string, string> = {};
	for (const [k, v] of attrs) out[k] = v.value;
	return out;
}

/**
 * Is the given attr visible for this record's current attribute values?
 * Attrs without a rule are always visible.
 */
export function isAttrVisible(tagName: string, attr: string, ctx: AttrCtx): boolean {
	const rule = VISIBILITY_RULES[tagName]?.[attr];
	return rule ? rule(ctx) : true;
}

/**
 * Dynamic-shape override for vector attrs whose arity depends on another
 * attr. Returns null when the schema's static shape is correct.
 *
 * Current rule: `geom.size` carries 1/2/3 values based on `geom.type`.
 */
export function dynamicShapeFor(
	tagName: string,
	attr: string,
	ctx: AttrCtx
): { count: number; flexible: boolean } | null {
	if (tagName === 'geom' && attr === 'size') {
		const t = ctx.type ?? 'sphere';
		switch (t) {
			case 'sphere':
				return { count: 1, flexible: false };
			case 'capsule':
			case 'cylinder':
				return { count: 2, flexible: true };
			case 'ellipsoid':
			case 'box':
			case 'plane':
				return { count: 3, flexible: false };
			case 'mesh':
			case 'hfield':
			case 'sdf':
				// Size ignored — asset derives its own extents. Fall through to
				// a flexible 3-slot field so the user can still type something
				// if they insist, but we don't treat it as required.
				return { count: 3, flexible: true };
			default:
				return { count: 3, flexible: true };
		}
	}
	return null;
}

export interface GroupedAttrs<T> {
	group: AttrGroup;
	entries: Array<{ attr: string; meta: AttrUIMeta; data: T }>;
}

/**
 * Group & sort a list of attribute descriptors by their UI group for display
 * in the editor. Hidden attributes are dropped. Groups with no entries are
 * skipped. Within a group, order is deterministic (first by attr name).
 */
export function groupAttrs<T>(
	attrs: ReadonlyArray<{ attr: string; data: T }>
): GroupedAttrs<T>[] {
	const buckets = new Map<AttrGroup, Array<{ attr: string; meta: AttrUIMeta; data: T }>>();
	for (const { attr, data } of attrs) {
		const meta = metaFor(attr);
		if (meta.hidden) continue;
		const list = buckets.get(meta.group) ?? [];
		list.push({ attr, meta, data });
		buckets.set(meta.group, list);
	}
	const result: GroupedAttrs<T>[] = [];
	for (const group of GROUP_ORDER) {
		const entries = buckets.get(group);
		if (!entries || entries.length === 0) continue;
		entries.sort((a, b) => a.attr.localeCompare(b.attr));
		result.push({ group, entries });
	}
	return result;
}
