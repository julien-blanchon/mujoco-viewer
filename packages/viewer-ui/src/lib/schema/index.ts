/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lazy singleton for the runtime MuJoCo schema. The XSD is imported as a raw
 * string so it's bundled once, and parsed on first access.
 */

import xsdText from '../../../schemas/mujoco.xsd?raw';
import { parseXsd } from './parseXsd.js';
import type { AttrSchema, ElementSchema, MujocoSchema } from './types.js';

let cached: MujocoSchema | null = null;

export function mujocoSchema(): MujocoSchema {
	if (!cached) cached = parseXsd(xsdText);
	return cached;
}

/** Convenience — `null` when tag unknown. */
export function attrSchemaFor(tagName: string, attrName: string): AttrSchema | null {
	return mujocoSchema().getAttr(tagName, attrName);
}

/** Convenience — `null` when tag unknown. */
export function elementSchemaFor(tagName: string): ElementSchema | null {
	return mujocoSchema().getElement(tagName);
}

export type { AttrSchema, AttrType, ElementSchema, MujocoSchema } from './types.js';
