/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-shot XSD parser that walks `mujoco.xsd` and produces a `MujocoSchema`
 * used by the inspector to pick the right input widget for each attribute.
 *
 * The parser is narrow on purpose — it doesn't implement the XSD spec. It
 * handles the small subset MuJoCo's schema actually uses:
 *   - `xs:simpleType` with `xs:restriction` + `xs:enumeration` → enum
 *   - `xs:simpleType` with named patterns we recognise ("threeRealsType", ...)
 *   - `xs:complexType` with `xs:attribute` + `xs:extension base=...`
 *   - `xs:element name="..." type="..."` declarations nested in complex types
 *
 * Shapes the XSD uses but we don't care about (xs:choice, xs:sequence, xs:group,
 * imports, etc.) are walked past without interpretation.
 */

import type { AttrSchema, AttrType, ElementSchema, MujocoSchema } from './types.js';

const XS = 'http://www.w3.org/2001/XMLSchema';

/**
 * Named pattern-based simple types keyed by their name in the XSD. MuJoCo's
 * schema uses a very consistent naming convention (`twoRealsType`,
 * `threeIntsType`, `upToFourRealsType`, `infRealsType`), so we map by name
 * instead of re-implementing the XSD pattern interpreter.
 */
const NAMED_NUMERIC_TYPES: Record<string, AttrType> = {
	twoIntsType: { kind: 'ints', count: 2 },
	upToTwoIntsType: { kind: 'ints', count: 2, flexible: true },
	threeIntsType: { kind: 'ints', count: 3 },
	upToThreeIntsType: { kind: 'ints', count: 3, flexible: true },
	infIntsType: { kind: 'ints', count: 0, unbounded: true },
	twoRealsType: { kind: 'reals', count: 2 },
	upToTwoRealsType: { kind: 'reals', count: 2, flexible: true },
	threeRealsType: { kind: 'reals', count: 3 },
	upToThreeRealsType: { kind: 'reals', count: 3, flexible: true },
	fourRealsType: { kind: 'reals', count: 4 },
	upToFourRealsType: { kind: 'reals', count: 4, flexible: true },
	fiveRealsType: { kind: 'reals', count: 5 },
	upToFiveRealsType: { kind: 'reals', count: 5, flexible: true },
	sixRealsType: { kind: 'reals', count: 6 },
	upToSixRealsType: { kind: 'reals', count: 6, flexible: true },
	sevenRealsType: { kind: 'reals', count: 7 },
	upToSevenRealsType: { kind: 'reals', count: 7, flexible: true },
	tenRealsType: { kind: 'reals', count: 10 },
	upToTenRealsType: { kind: 'reals', count: 10, flexible: true },
	infRealsType: { kind: 'reals', count: 0, unbounded: true },
	solimpType: { kind: 'realsVariants', variants: [3, 5] },
	eulerseqType: { kind: 'string', pattern: '[x-zX-Z]{3}' },
	autoBoolType: { kind: 'autoBool' }
};

/** Built-in XSD primitive types we understand. */
const BUILTIN_TYPES: Record<string, AttrType> = {
	'xs:int': { kind: 'int' },
	'xs:integer': { kind: 'int' },
	'xs:unsignedInt': { kind: 'int' },
	'xs:short': { kind: 'int' },
	'xs:double': { kind: 'float' },
	'xs:float': { kind: 'float' },
	'xs:decimal': { kind: 'float' },
	'xs:boolean': { kind: 'bool' },
	'xs:string': { kind: 'string' },
	'xs:anyURI': { kind: 'string' },
	'xs:normalizedString': { kind: 'string' },
	'xs:token': { kind: 'string' }
};

interface RawAttrDecl {
	name: string;
	typeRef: string;
	required: boolean;
	default: string | null;
}

interface RawComplexType {
	attrs: RawAttrDecl[];
	extendsBase: string | null;
	/** Inline child elements discovered inside this complex type. */
	childElements: Array<{ name: string; typeRef: string | null; inlineType?: RawComplexType }>;
}

/** Extract the local name of an XML element (strip namespace prefix). */
function localName(node: Element): string {
	const n = node.localName ?? node.nodeName;
	return n.includes(':') ? n.split(':').pop()! : n;
}

/** Find all direct `xs:*` element children with a given local name. */
function xsChildren(parent: Element, local: string): Element[] {
	const out: Element[] = [];
	for (let i = 0; i < parent.children.length; i++) {
		const c = parent.children[i];
		if (localName(c) === local) out.push(c);
	}
	return out;
}

/** Recursive search for first descendant with the given local name. */
function xsDescendant(parent: Element, local: string): Element | null {
	for (let i = 0; i < parent.children.length; i++) {
		const c = parent.children[i];
		if (localName(c) === local) return c;
		const inner = xsDescendant(c, local);
		if (inner) return inner;
	}
	return null;
}

function parseAttribute(el: Element): RawAttrDecl {
	return {
		name: el.getAttribute('name') ?? '',
		typeRef: el.getAttribute('type') ?? 'xs:string',
		required: el.getAttribute('use') === 'required',
		default: el.getAttribute('default')
	};
}

function parseComplexType(el: Element): RawComplexType {
	const out: RawComplexType = { attrs: [], extendsBase: null, childElements: [] };

	// Attributes may be direct children OR nested inside complexContent/extension.
	const extension = xsDescendant(el, 'extension');
	if (extension) out.extendsBase = extension.getAttribute('base');

	// Walk the subtree to collect every xs:attribute — they can appear at any
	// depth inside extension / sequence / choice / group.
	const collectAttrs = (node: Element): void => {
		for (let i = 0; i < node.children.length; i++) {
			const c = node.children[i];
			const n = localName(c);
			if (n === 'attribute') out.attrs.push(parseAttribute(c));
			else if (n === 'complexType') {
				// Inline complex type for a nested element — don't descend
				continue;
			} else {
				collectAttrs(c);
			}
		}
	};
	collectAttrs(el);

	// Discover child element declarations (xs:element), used to learn the
	// type-name an outer tag references (e.g. `<body>` declares `<geom type="bodyGeomType"/>`
	// inside its choice).
	const collectElements = (node: Element): void => {
		for (let i = 0; i < node.children.length; i++) {
			const c = node.children[i];
			const n = localName(c);
			if (n === 'element') {
				const name = c.getAttribute('name');
				const typeRef = c.getAttribute('type');
				if (name) {
					const inline = xsChildren(c, 'complexType')[0];
					out.childElements.push({
						name,
						typeRef: typeRef ?? null,
						inlineType: inline ? parseComplexType(inline) : undefined
					});
				}
			} else if (n === 'attribute' || n === 'complexType') {
				continue;
			} else {
				collectElements(c);
			}
		}
	};
	collectElements(el);
	return out;
}

/**
 * Classify a type reference. For user-defined simple types we look up the
 * enum (if any) and fall back to the named-numeric map. For built-ins the
 * BUILTIN_TYPES table is authoritative.
 */
function classifyTypeRef(
	typeRef: string,
	enums: Map<string, readonly string[]>
): AttrType {
	if (BUILTIN_TYPES[typeRef]) return BUILTIN_TYPES[typeRef];
	if (NAMED_NUMERIC_TYPES[typeRef]) return NAMED_NUMERIC_TYPES[typeRef];
	const enumValues = enums.get(typeRef);
	if (enumValues) return { kind: 'enum', values: enumValues };
	// Unknown type ref — treat as free-form string. This happens for
	// string-valued named types (e.g. `urlType`) where we don't benefit from
	// special input.
	return { kind: 'string' };
}

function classifyAttr(
	raw: RawAttrDecl,
	enums: Map<string, readonly string[]>
): AttrSchema {
	return {
		name: raw.name,
		required: raw.required,
		default: raw.default,
		type: classifyTypeRef(raw.typeRef, enums)
	};
}

/**
 * Build a table mapping element tag names to the complex type that represents
 * their *instance* context (e.g. `<geom>` inside a `<body>`, not inside a
 * `<default>` block). For tags with only one appearance we pick that one;
 * for tags that appear in multiple contexts we prefer the non-default version
 * since instance values are what the inspector edits.
 */
function buildElementToType(
	complexTypes: Map<string, RawComplexType>
): Map<string, string> {
	const candidates: Map<string, string[]> = new Map();
	for (const [typeName, ct] of complexTypes) {
		for (const child of ct.childElements) {
			if (!child.typeRef) continue;
			const list = candidates.get(child.name) ?? [];
			list.push(child.typeRef);
			candidates.set(child.name, list);
		}
	}
	const out: Map<string, string> = new Map();
	for (const [tag, refs] of candidates) {
		// Preference rules:
		//  1. Types under `body*` (instance context for body-children)
		//  2. Types under `asset*` (asset instances)
		//  3. Anything else (first seen)
		const preferred =
			refs.find((r) => r.startsWith('body') && !r.startsWith('bodyComposite')) ??
			refs.find((r) => r.startsWith('asset')) ??
			refs.find((r) => r.startsWith('actuator')) ??
			refs.find((r) => r.startsWith('sensor')) ??
			refs.find((r) => r.startsWith('equality')) ??
			refs.find((r) => r.startsWith('tendon')) ??
			refs.find((r) => !r.startsWith('default')) ??
			refs[0];
		out.set(tag, preferred);
	}
	return out;
}

function resolveElement(
	typeName: string,
	complexTypes: Map<string, RawComplexType>,
	enums: Map<string, readonly string[]>,
	visited = new Set<string>()
): Map<string, AttrSchema> {
	if (visited.has(typeName)) return new Map();
	visited.add(typeName);
	const ct = complexTypes.get(typeName);
	if (!ct) return new Map();
	// Walk the extension chain first so derived attrs can override base defaults.
	const out = ct.extendsBase
		? resolveElement(ct.extendsBase, complexTypes, enums, visited)
		: new Map<string, AttrSchema>();
	for (const raw of ct.attrs) {
		if (!raw.name) continue;
		out.set(raw.name, classifyAttr(raw, enums));
	}
	return out;
}

export function parseXsd(xsdText: string): MujocoSchema {
	const doc = new DOMParser().parseFromString(xsdText, 'application/xml');
	if (doc.documentElement?.nodeName === 'parsererror') {
		throw new Error('[mujoco-schema] XSD parse error');
	}
	const root = doc.documentElement;

	// Pass 1: collect simpleType enums
	const enums: Map<string, readonly string[]> = new Map();
	for (const st of xsChildren(root, 'simpleType')) {
		const name = st.getAttribute('name');
		if (!name) continue;
		const restriction = xsDescendant(st, 'restriction');
		if (!restriction) continue;
		const enumerations = xsChildren(restriction, 'enumeration');
		if (enumerations.length === 0) continue;
		enums.set(
			name,
			enumerations.map((e) => e.getAttribute('value') ?? '').filter((v) => v !== '')
		);
	}

	// Pass 2: collect complexTypes
	const complexTypes: Map<string, RawComplexType> = new Map();
	for (const ct of xsChildren(root, 'complexType')) {
		const name = ct.getAttribute('name');
		if (!name) continue;
		complexTypes.set(name, parseComplexType(ct));
	}
	// Also collect inline complex types from top-level xs:element declarations
	// (`<xs:element name="mujoco"><xs:complexType>...`): walk any named element
	// at the root level.
	for (const el of xsChildren(root, 'element')) {
		const name = el.getAttribute('name');
		if (!name) continue;
		const inline = xsChildren(el, 'complexType')[0];
		if (inline) complexTypes.set(name, parseComplexType(inline));
	}

	// Pass 3: build tag → type mapping
	const elementToType = buildElementToType(complexTypes);
	// Root `<mujoco>` element is declared at the top level as an xs:element.
	if (!elementToType.has('mujoco') && complexTypes.has('mujoco')) {
		elementToType.set('mujoco', 'mujoco');
	}

	// Materialize an ElementSchema for every known tag. Do it lazily to keep
	// construction cheap, but memoize.
	const elementCache = new Map<string, ElementSchema | null>();

	function getElement(tagName: string): ElementSchema | null {
		if (elementCache.has(tagName)) return elementCache.get(tagName)!;
		const typeName = elementToType.get(tagName);
		if (!typeName) {
			elementCache.set(tagName, null);
			return null;
		}
		const attrs = resolveElement(typeName, complexTypes, enums);
		const schema: ElementSchema = { typeName, attrs };
		elementCache.set(tagName, schema);
		return schema;
	}

	return {
		getElement,
		getAttr(tagName: string, attrName: string): AttrSchema | null {
			const el = getElement(tagName);
			return el?.attrs.get(attrName) ?? null;
		},
		allTags(): string[] {
			return Array.from(elementToType.keys()).sort();
		}
	};
}
