/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parses a MuJoCo XML source string into a structured index of entities, each
 * keyed by `{ kind, index }` matching `mjModel` compile order. The index also
 * lets callers reverse-resolve a byte offset back to an entity (for "click in
 * source view → highlight in 3D" flows).
 *
 * Editing primitives live on `XmlEditOps` so this file stays read-only; the
 * index itself is immutable once built.
 *
 * `<include>` support: pass a `resolveInclude` callback and the index walks
 * each include recursively, splicing its entities into the parent traversal so
 * compile-order indices keep matching `mjModel`. Per-file `{text, tree,
 * lineMap}` state is retained on `files` so byte-range edit ops can splice
 * the correct file — each record carries the `sourceFile` it came from.
 *
 * MVP simplifications (intentionally out of scope, will be added later):
 *   - `<default>` inheritance is not resolved. We expose only literal source
 *     attributes; the live `mjModel` value is always the source of truth for
 *     "current value" displays.
 *   - Children of `<default>`, `<contact>`, `<custom>`, `<extension>`,
 *     `<visual>`, etc. are skipped — they are not entity instances.
 *   - `entityAtOffset` / `positionAt` operate on the main file only. Reverse
 *     offset lookup inside an included file isn't wired up yet.
 */

import { parser } from '@lezer/xml';
import type { SyntaxNode, Tree } from '@lezer/common';
import type { EntityKind } from '../../types.js';
import type { XmlAttrRecord, XmlEntityRecord, XmlSourceRange } from './types.js';

const ENTITY_KINDS = [
	'body',
	'joint',
	'geom',
	'site',
	'camera',
	'light',
	'material',
	'texture',
	'mesh',
	'tendon',
	'actuator',
	'sensor',
	'equality',
	'keyframe'
] as const satisfies readonly EntityKind[];

/**
 * Direct tag → entity kind mapping for tags whose kind is independent of
 * their parent block. `<freejoint>` is a syntactic shortcut for a free
 * joint, so it shares the joint kind.
 */
const TAG_KIND: Record<string, EntityKind> = {
	body: 'body',
	joint: 'joint',
	freejoint: 'joint',
	geom: 'geom',
	site: 'site',
	camera: 'camera',
	light: 'light',
	material: 'material',
	texture: 'texture',
	mesh: 'mesh'
};

/**
 * Parent block tag → kind. When the immediate parent element is one of these,
 * every child element (regardless of tag name) becomes that kind. Lets us
 * cover the polymorphic actuator/sensor/equality children without listing
 * every variant tag (`motor`, `position`, `velocity`, `connect`, `weld`, ...).
 */
const PARENT_BLOCK_KIND: Record<string, EntityKind> = {
	actuator: 'actuator',
	sensor: 'sensor',
	equality: 'equality',
	tendon: 'tendon',
	keyframe: 'keyframe'
};

/**
 * If any ancestor element has one of these tags, suppress entity classification
 * entirely. `<default>` blocks define class defaults, not entities;
 * `<contact>`/`<custom>`/`<extension>` carry meta-config we don't expose yet.
 */
const SUPPRESSING_ANCESTORS = new Set([
	'default',
	'contact',
	'custom',
	'extension',
	'visual',
	'option',
	'compiler',
	'size',
	'statistic'
]);

/** Max nested `<include>` depth. Guards against malformed recursive includes. */
const MAX_INCLUDE_DEPTH = 32;

/** Cheap binary search over precomputed line starts for `offset → {line,col}`. */
class LineMap {
	private readonly lineStarts: number[];

	constructor(text: string) {
		const starts = [0];
		for (let i = 0; i < text.length; i++) {
			if (text.charCodeAt(i) === 10) starts.push(i + 1);
		}
		this.lineStarts = starts;
	}

	positionAt(offset: number): { line: number; col: number } {
		const arr = this.lineStarts;
		let lo = 0;
		let hi = arr.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >>> 1;
			if (arr[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo + 1, col: offset - arr[lo] + 1 };
	}
}

function makeRange(from: number, to: number, lm: LineMap): XmlSourceRange {
	const { line, col } = lm.positionAt(from);
	return { from, to, line, col };
}

function decodeXmlEntities(s: string): string {
	if (!s.includes('&')) return s;
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
		.replace(/&amp;/g, '&');
}

/** Read a node's text from the source. */
function nodeText(text: string, node: SyntaxNode): string {
	return text.slice(node.from, node.to);
}

/** Find the OpenTag (or SelfClosingTag) child of an Element node. */
function elementOpener(elem: SyntaxNode): SyntaxNode | null {
	const c = elem.firstChild;
	if (!c) return null;
	if (c.name === 'OpenTag' || c.name === 'SelfClosingTag') return c;
	return null;
}

function elementTagName(elem: SyntaxNode, text: string): string | null {
	const opener = elementOpener(elem);
	if (!opener) return null;
	for (let c = opener.firstChild; c; c = c.nextSibling) {
		if (c.name === 'TagName') return nodeText(text, c);
	}
	return null;
}

function parseAttribute(
	attrNode: SyntaxNode,
	text: string,
	lm: LineMap
): XmlAttrRecord | null {
	let nameNode: SyntaxNode | null = null;
	let valueNode: SyntaxNode | null = null;
	for (let c = attrNode.firstChild; c; c = c.nextSibling) {
		if (c.name === 'AttributeName') nameNode = c;
		else if (c.name === 'AttributeValue') valueNode = c;
	}
	if (!nameNode || !valueNode) return null;

	const name = nodeText(text, nameNode);
	// AttributeValue includes the quote characters — strip them so callers can
	// splice the inner range without touching the quotes.
	let innerFrom = valueNode.from;
	let innerTo = valueNode.to;
	const firstCh = text.charCodeAt(innerFrom);
	const lastCh = text.charCodeAt(innerTo - 1);
	const isQuoted =
		(firstCh === 34 || firstCh === 39) && firstCh === lastCh && innerTo - innerFrom >= 2;
	if (isQuoted) {
		innerFrom += 1;
		innerTo -= 1;
	}
	const raw = text.slice(innerFrom, innerTo);
	return {
		name,
		value: decodeXmlEntities(raw),
		nameRange: makeRange(nameNode.from, nameNode.to, lm),
		valueRange: makeRange(innerFrom, innerTo, lm)
	};
}

function collectAttributes(
	elem: SyntaxNode,
	text: string,
	lm: LineMap
): Map<string, XmlAttrRecord> {
	const attrs = new Map<string, XmlAttrRecord>();
	const opener = elementOpener(elem);
	if (!opener) return attrs;
	for (let c = opener.firstChild; c; c = c.nextSibling) {
		if (c.name === 'Attribute') {
			const attr = parseAttribute(c, text, lm);
			if (attr && !attrs.has(attr.name)) attrs.set(attr.name, attr);
		}
	}
	return attrs;
}

/**
 * Per-file parse state. Kept on the index so edit ops can look up the right
 * text to splice for a record based on `record.sourceFile`.
 */
export interface XmlFileEntry {
	text: string;
	tree: Tree;
	lineMap: LineMap;
}

/**
 * Resolve an `<include file="..."/>` reference to the target file's text +
 * absolute (FS-relative) path. Return `null` to skip — the include is then
 * treated as if empty, which matches the MVP behavior when no resolver is
 * supplied.
 */
export type IncludeResolver = (
	relFile: string,
	fromFile: string
) => { fname: string; text: string } | null;

export interface XmlIndexOptions {
	sourceFile: string;
	resolveInclude?: IncludeResolver;
}

/**
 * Immutable index of MJCF entities in a source XML string. Construction parses
 * once with `@lezer/xml` and walks the tree in document order to bucket
 * entities by kind. After construction, all lookups are O(1) or O(log n).
 *
 * The index is *immutable*: edits return a new XML string (via XmlEditOps) and
 * the caller is responsible for re-constructing an `XmlIndex` from the new
 * text.
 */
export class XmlIndex {
	/** Main scene file path (matches the legacy single-file API). */
	readonly sourceFile: string;
	/** Per-file parse state, keyed by MuJoCo-relative path. */
	readonly files: Map<string, XmlFileEntry>;
	readonly entities: Record<EntityKind, readonly XmlEntityRecord[]>;
	readonly all: readonly XmlEntityRecord[];
	/**
	 * All records sorted by `(sourceFile, fullRange.from)` for reverse lookup.
	 * Reverse lookup is scoped to a single file — cross-file offsets are
	 * ambiguous so `entityAtOffset` still takes one file at a time.
	 */
	private readonly sortedByOffsetPerFile: Map<string, readonly XmlEntityRecord[]>;

	constructor(text: string, options: XmlIndexOptions) {
		this.sourceFile = options.sourceFile;
		this.files = new Map();

		const mainEntry: XmlFileEntry = {
			text,
			tree: parser.parse(text),
			lineMap: new LineMap(text)
		};
		this.files.set(options.sourceFile, mainEntry);

		const { records, buckets } = buildBuckets({
			mainFile: options.sourceFile,
			main: mainEntry,
			files: this.files,
			resolveInclude: options.resolveInclude
		});
		this.all = records;
		this.entities = buckets;

		// Per-file sort for entityAtOffset — records from different files can't
		// be totally ordered by offset, so bucket them per source.
		const perFile = new Map<string, XmlEntityRecord[]>();
		for (const rec of records) {
			let arr = perFile.get(rec.sourceFile);
			if (!arr) {
				arr = [];
				perFile.set(rec.sourceFile, arr);
			}
			arr.push(rec);
		}
		for (const arr of perFile.values()) {
			arr.sort((a, b) => a.fullRange.from - b.fullRange.from);
		}
		this.sortedByOffsetPerFile = perFile;
	}

	/** Back-compat getter — returns the main file's text. */
	get text(): string {
		return this.files.get(this.sourceFile)!.text;
	}

	/** Back-compat getter — returns the main file's lezer tree. */
	get tree(): Tree {
		return this.files.get(this.sourceFile)!.tree;
	}

	/** Look up an entity by its compile-order index for the given kind. */
	lookup(kind: EntityKind, index: number): XmlEntityRecord | null {
		const bucket = this.entities[kind];
		return bucket[index] ?? null;
	}

	/** Look up an entity by its name attribute (first match wins). */
	lookupByName(kind: EntityKind, name: string): XmlEntityRecord | null {
		const bucket = this.entities[kind];
		for (const rec of bucket) if (rec.name === name) return rec;
		return null;
	}

	/**
	 * Find the *deepest* entity whose source range contains `offset` *within the
	 * given file* (defaults to the main scene file). Returns null if the offset
	 * is outside any tracked entity (text content, comments, top-level options,
	 * etc.) or the file isn't part of this index.
	 */
	entityAtOffset(offset: number, file?: string): XmlEntityRecord | null {
		const arr = this.sortedByOffsetPerFile.get(file ?? this.sourceFile);
		if (!arr || arr.length === 0) return null;
		// Binary-search the largest start ≤ offset, then walk backwards through
		// any siblings that still contain `offset`. For nested elements, the
		// deepest containing record has the largest `from` ≤ offset that also
		// has `to` > offset.
		let lo = 0;
		let hi = arr.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >>> 1;
			if (arr[mid].fullRange.from <= offset) lo = mid;
			else hi = mid - 1;
		}
		for (let i = lo; i >= 0; i--) {
			const r = arr[i];
			if (r.fullRange.to > offset) return r;
			if (r.fullRange.from > offset) continue;
		}
		return null;
	}

	/**
	 * 1-indexed line/col for a byte offset. `file` defaults to the main scene.
	 */
	positionAt(offset: number, file?: string): { line: number; col: number } {
		const entry = this.files.get(file ?? this.sourceFile);
		if (!entry) return { line: 1, col: 1 };
		return entry.lineMap.positionAt(offset);
	}

	/** Retrieve the post-parse text of a tracked file, or null if unknown. */
	textOf(file: string): string | null {
		return this.files.get(file)?.text ?? null;
	}

	/** All entity kinds that have at least one record. */
	get nonEmptyKinds(): readonly EntityKind[] {
		return ENTITY_KINDS.filter((k) => this.entities[k].length > 0);
	}
}

// ---- Internals ----

interface BuildOptions {
	mainFile: string;
	main: XmlFileEntry;
	files: Map<string, XmlFileEntry>;
	resolveInclude?: IncludeResolver;
}

interface BuildResult {
	records: XmlEntityRecord[];
	buckets: Record<EntityKind, XmlEntityRecord[]>;
}

function buildBuckets(opts: BuildOptions): BuildResult {
	const buckets: Record<EntityKind, XmlEntityRecord[]> = {
		body: [],
		joint: [],
		geom: [],
		site: [],
		camera: [],
		light: [],
		material: [],
		texture: [],
		mesh: [],
		tendon: [],
		actuator: [],
		sensor: [],
		equality: [],
		keyframe: []
	};
	const records: XmlEntityRecord[] = [];

	// Body stack tracks the current parent body for hierarchical entities. We
	// push when entering a `<body>` (or `<worldbody>`), pop on exit. The top of
	// the stack is the parent index for any entity defined directly inside.
	// Include expansion preserves the stack — an included file's bodies nest
	// under whichever body was open at the `<include>` site.
	const bodyStack: number[] = [];
	// MuJoCo merges every `<worldbody>` (across includes) into body[0]. We
	// classify the first one encountered and then treat subsequent ones as
	// transparent containers so their children still nest under worldbody.
	let worldbodyIndex = -1;

	function makeRecord(
		elem: SyntaxNode,
		text: string,
		lm: LineMap,
		sourceFile: string,
		tagName: string,
		kind: EntityKind,
		attrs: Map<string, XmlAttrRecord>
	): XmlEntityRecord {
		const opener = elementOpener(elem);
		const openTagFrom = opener ? opener.from : elem.from;
		const openTagTo = opener ? opener.to : elem.to;
		const selfClosing = opener?.name === 'SelfClosingTag';
		const nameAttr = attrs.get('name');
		return {
			kind,
			index: -1, // assigned when bucketed below
			name: nameAttr ? nameAttr.value : null,
			tagName,
			sourceFile,
			fullRange: makeRange(elem.from, elem.to, lm),
			openTagRange: makeRange(openTagFrom, openTagTo, lm),
			selfClosing,
			attrs,
			parentBodyIndex: bodyStack.length > 0 ? bodyStack[bodyStack.length - 1] : -1
		};
	}

	function classify(tagName: string, parentTag: string | null): EntityKind | null {
		if (tagName === 'worldbody') return 'body';
		if (parentTag && PARENT_BLOCK_KIND[parentTag]) return PARENT_BLOCK_KIND[parentTag];
		return TAG_KIND[tagName] ?? null;
	}

	function includeFileAttr(elem: SyntaxNode, text: string, lm: LineMap): string | null {
		const attrs = collectAttributes(elem, text, lm);
		return attrs.get('file')?.value ?? null;
	}

	function visit(
		node: SyntaxNode,
		text: string,
		lm: LineMap,
		sourceFile: string,
		parentTag: string | null,
		suppressed: boolean,
		includeChain: readonly string[]
	): void {
		if (node.name !== 'Element') {
			for (let c = node.firstChild; c; c = c.nextSibling) {
				visit(c, text, lm, sourceFile, parentTag, suppressed, includeChain);
			}
			return;
		}
		const tagName = elementTagName(node, text);
		if (!tagName) {
			for (let c = node.firstChild; c; c = c.nextSibling) {
				visit(c, text, lm, sourceFile, parentTag, suppressed, includeChain);
			}
			return;
		}

		// `<include>` expansion — when not inside a suppressing block and a
		// resolver is supplied, parse the referenced file and walk its entities
		// in-place. The parent body stack is preserved, so bodies inside the
		// include nest under the currently-open body. Nested includes work
		// because the recursive visit may hit more `<include>` elements.
		if (tagName === 'include' && !suppressed && opts.resolveInclude) {
			if (includeChain.length >= MAX_INCLUDE_DEPTH) {
				console.warn(
					`[XmlIndex] include depth limit reached (${MAX_INCLUDE_DEPTH}); skipping further expansion`
				);
				return;
			}
			const relFile = includeFileAttr(node, text, lm);
			if (relFile) {
				const resolved = opts.resolveInclude(relFile, sourceFile);
				if (resolved) {
					if (includeChain.includes(resolved.fname)) {
						console.warn(
							`[XmlIndex] circular include detected: ${[...includeChain, resolved.fname].join(' → ')}`
						);
						return;
					}
					let entry = opts.files.get(resolved.fname);
					if (!entry) {
						entry = {
							text: resolved.text,
							tree: parser.parse(resolved.text),
							lineMap: new LineMap(resolved.text)
						};
						opts.files.set(resolved.fname, entry);
					}
					const nextChain = [...includeChain, resolved.fname];
					// Walk the included file's top-level children. The lezer root
					// has a single `<mujoco>` Element child whose children are the
					// real content; our visitor handles the wrapper transparently
					// because `mujoco` isn't a classified tag.
					const subRoot = entry.tree.topNode;
					for (let c = subRoot.firstChild; c; c = c.nextSibling) {
						visit(c, entry.text, entry.lineMap, resolved.fname, null, false, nextChain);
					}
				}
			}
			return;
		}

		const childSuppressed = suppressed || SUPPRESSING_ANCESTORS.has(tagName);
		let pushedBody = false;

		if (!suppressed) {
			// `<worldbody>` merges across files — classify only the first one
			// and keep body[0] on the stack while we walk subsequent ones so
			// their children attach to the same merged root.
			if (tagName === 'worldbody' && worldbodyIndex >= 0) {
				bodyStack.push(worldbodyIndex);
				pushedBody = true;
			} else {
				const kind = classify(tagName, parentTag);
				if (kind) {
					const attrs = collectAttributes(node, text, lm);
					const rec = makeRecord(node, text, lm, sourceFile, tagName, kind, attrs);
					const bucket = buckets[kind];
					rec.index = bucket.length;
					bucket.push(rec);
					records.push(rec);
					if (kind === 'body') {
						bodyStack.push(rec.index);
						pushedBody = true;
						if (tagName === 'worldbody') worldbodyIndex = rec.index;
					}
				}
			}
		}

		for (let c = node.firstChild; c; c = c.nextSibling) {
			visit(c, text, lm, sourceFile, tagName, childSuppressed, includeChain);
		}

		if (pushedBody) bodyStack.pop();
	}

	const root = opts.main.tree.topNode;
	for (let c = root.firstChild; c; c = c.nextSibling) {
		visit(c, opts.main.text, opts.main.lineMap, opts.mainFile, null, false, []);
	}

	return { records, buckets };
}
