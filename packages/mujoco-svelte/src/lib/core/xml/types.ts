/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Public types for the XML index / edit pipeline. The index is the bridge
 * between MuJoCo's compiled `mjModel` (numeric IDs) and the source XML text
 * (byte ranges). Edit ops are pure: they return a new XML string, never
 * mutating in place.
 */

import type { EntityKind } from '../../types.js';

/** Byte offsets + 1-indexed line/col for editor highlighting. */
export interface XmlSourceRange {
	/** Inclusive start byte offset. */
	from: number;
	/** Exclusive end byte offset. */
	to: number;
	/** 1-indexed line number of `from`. */
	line: number;
	/** 1-indexed column number of `from`. */
	col: number;
}

/**
 * One attribute on an XML element, with byte ranges for both name and value.
 *
 * `valueRange` is *inside* the surrounding quotes — splicing that range is
 * safe and never touches the quote characters. `value` is the decoded string
 * (XML entities like `&amp;` resolved).
 */
export interface XmlAttrRecord {
	name: string;
	value: string;
	nameRange: XmlSourceRange;
	valueRange: XmlSourceRange;
}

/**
 * One MJCF entity — a body, geom, joint, actuator, etc. — located in the
 * source XML.
 *
 * `index` matches the corresponding `mjModel` ID for this kind: bodies are
 * indexed in DFS order from `<worldbody>` (which itself is body[0]); geoms,
 * joints, sites, cameras, lights inside a body keep source order. Asset and
 * top-level block entities (material, actuator, sensor, ...) are indexed in
 * document order.
 *
 * `parentBodyIndex` is the index of the enclosing body (or -1 if the entity
 * lives outside any body, e.g. assets, actuators). Used for navigation and
 * diff display.
 */
export interface XmlEntityRecord {
	kind: EntityKind;
	index: number;
	/** `name=""` attribute value if present, else `null`. */
	name: string | null;
	/** Source XML tag name (e.g. `body`, `geom`, `freejoint`, `motor`). */
	tagName: string;
	/** Source file this entity is defined in (main scene file for now). */
	sourceFile: string;
	/** Range of the whole element including its closing tag. */
	fullRange: XmlSourceRange;
	/** Range of the opening tag only (`<body ...>` — where attrs live). */
	openTagRange: XmlSourceRange;
	selfClosing: boolean;
	attrs: Map<string, XmlAttrRecord>;
	parentBodyIndex: number;
}

/** Whether an entity is editable in the current MVP. */
export interface XmlEntityEditability {
	editable: boolean;
	reason?: string;
}
