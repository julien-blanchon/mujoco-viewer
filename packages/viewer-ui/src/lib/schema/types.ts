/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runtime type model extracted from `mujoco.xsd`. Every attribute on every
 * MJCF element gets classified into one of these kinds, so each inspector
 * field can render the right input (select / number / vector / boolean /
 * text) without per-inspector case-analysis.
 */

/** Classification of an XML attribute value. */
export type AttrType =
	| { kind: 'enum'; values: readonly string[] }
	/** Single `xs:boolean` — "true" / "false". */
	| { kind: 'bool' }
	/** Tri-state `autoBoolType` — "true" / "false" / "auto". */
	| { kind: 'autoBool' }
	/** Single int (`xs:int` / `xs:integer`). */
	| { kind: 'int' }
	/** Single real (`xs:double` / `xs:float`). */
	| { kind: 'float' }
	/**
	 * Fixed-count int vector (e.g. `twoIntsType` → count=2). `upTo*` is modelled
	 * as `{ count, flexible: true }` so the UI can render count slots but
	 * tolerate partial values.
	 */
	| { kind: 'ints'; count: number; flexible?: boolean; unbounded?: boolean }
	/** Fixed-count real vector (e.g. `threeRealsType` → count=3). */
	| { kind: 'reals'; count: number; flexible?: boolean; unbounded?: boolean }
	/**
	 * Special: `solimpType` accepts EITHER 3 reals OR 5 reals. We keep the
	 * variant list so the UI can offer both lengths.
	 */
	| { kind: 'realsVariants'; variants: readonly number[] }
	/** Free-form string (optionally pattern-constrained). */
	| { kind: 'string'; pattern?: string };

export interface AttrSchema {
	name: string;
	required: boolean;
	/** Literal default from the XSD (raw string), or `null` if not specified. */
	default: string | null;
	type: AttrType;
}

export interface ElementSchema {
	/** XSD complex type name this element resolves to (e.g. `bodyGeomType`). */
	typeName: string;
	/** All attributes on the type, after expanding extension chains. */
	attrs: Map<string, AttrSchema>;
}

export interface MujocoSchema {
	/**
	 * Resolve an element's attribute schema. `tagName` is the XML element name
	 * as it appears in source (e.g. "geom", "motor", "material"). When a tag
	 * has context-dependent types (e.g. `<geom>` inside a `<body>` vs inside
	 * `<default>`), this returns the instance-context type — the one that
	 * applies to entities the user actually edits.
	 */
	getElement(tagName: string): ElementSchema | null;
	getAttr(tagName: string, attrName: string): AttrSchema | null;
	/** The full set of registered tag names (useful for debugging). */
	allTags(): string[];
}
