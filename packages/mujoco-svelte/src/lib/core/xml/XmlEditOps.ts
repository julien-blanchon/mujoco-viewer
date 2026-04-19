/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure text-patch primitives for MuJoCo XML. Each function takes the current
 * XML string + an `XmlEntityRecord` (looked up via `XmlIndex`) and returns a
 * new XML string. Functions never mutate inputs.
 *
 * Formatting preservation is the core promise: an attribute edit only touches
 * the bytes between the surrounding quotes, so comments, indentation, and
 * unrelated attributes stay byte-identical.
 */

import type { XmlAttrRecord, XmlEntityRecord } from './types.js';

function escapeXmlAttrValue(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Set (or insert) an attribute on an element.
 *
 * - Existing attribute: splice the new value into `valueRange` — only the
 *   value bytes change, quotes/spacing/comments stay untouched.
 * - Missing attribute: insert ` name="value"` just before the open tag's `>`
 *   (or `/>` if self-closing). New attributes always sort to the end of the
 *   tag — we don't try to alphabetize.
 *
 * The new attribute value is XML-escaped (so values like `1 < 2` survive a
 * round-trip).
 */
export function setAttr(
	text: string,
	rec: XmlEntityRecord,
	name: string,
	value: string
): string {
	const existing = rec.attrs.get(name);
	const escaped = escapeXmlAttrValue(value);
	if (existing) {
		return spliceText(text, existing.valueRange.from, existing.valueRange.to, escaped);
	}
	const insertionPoint = openTagInsertionPoint(text, rec);
	return spliceText(text, insertionPoint, insertionPoint, ` ${name}="${escaped}"`);
}

/**
 * Remove an attribute from an element. Strips the leading whitespace before the
 * attribute too, so the output stays well-formatted (no double spaces).
 */
export function removeAttr(text: string, rec: XmlEntityRecord, name: string): string {
	const existing = rec.attrs.get(name);
	if (!existing) return text;
	// `nameRange.from` is the start of the attribute name; back up over any
	// preceding spaces/tabs (but NOT newlines) so we don't leave a hole.
	let cutFrom = existing.nameRange.from;
	while (cutFrom > 0) {
		const ch = text.charCodeAt(cutFrom - 1);
		if (ch === 32 || ch === 9) cutFrom--;
		else break;
	}
	const cutTo = existing.valueRange.to + 1; // include the trailing quote
	return spliceText(text, cutFrom, cutTo, '');
}

/**
 * Set the `name=""` attribute on an element (insert if absent). For our
 * purposes "rename" means changing how MuJoCo / inspectors refer to the
 * entity, not changing the element's tag name.
 */
export function renameElement(
	text: string,
	rec: XmlEntityRecord,
	newName: string
): string {
	return setAttr(text, rec, 'name', newName);
}

/**
 * Remove an element from its source. Includes the element's leading whitespace
 * on the same line (so the line that held it goes away cleanly) and the
 * trailing newline if any.
 */
export function removeElement(text: string, rec: XmlEntityRecord): string {
	let cutFrom = rec.fullRange.from;
	let cutTo = rec.fullRange.to;
	// Eat leading whitespace on the same line (spaces/tabs).
	while (cutFrom > 0) {
		const ch = text.charCodeAt(cutFrom - 1);
		if (ch === 32 || ch === 9) cutFrom--;
		else break;
	}
	// If we backed up to a newline (the element occupied the whole line),
	// also drop the trailing newline so the empty line goes with it.
	const startedAtLineHead = cutFrom === 0 || text.charCodeAt(cutFrom - 1) === 10;
	if (startedAtLineHead && text.charCodeAt(cutTo) === 10) cutTo += 1;
	return spliceText(text, cutFrom, cutTo, '');
}

/** All raw attributes of a record, in source order. Helper for diff displays. */
export function listAttrs(rec: XmlEntityRecord): readonly XmlAttrRecord[] {
	return Array.from(rec.attrs.values()).sort((a, b) => a.nameRange.from - b.nameRange.from);
}

function spliceText(text: string, from: number, to: number, insert: string): string {
	return text.slice(0, from) + insert + text.slice(to);
}

function openTagInsertionPoint(text: string, rec: XmlEntityRecord): number {
	// Open tag ends with `>` (regular) or `/>` (self-closing). Skip backwards
	// over trailing whitespace before the closer to land in a clean spot.
	const end = rec.openTagRange.to;
	const closerLen = rec.selfClosing ? 2 : 1;
	let p = end - closerLen;
	while (p > rec.openTagRange.from) {
		const ch = text.charCodeAt(p - 1);
		if (ch === 32 || ch === 9) p--;
		else break;
	}
	return p;
}
