/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export { XmlIndex } from './XmlIndex.js';
export type { XmlIndexOptions, XmlFileEntry, IncludeResolver } from './XmlIndex.js';
export type {
	XmlAttrRecord,
	XmlEntityRecord,
	XmlSourceRange,
	XmlEntityEditability
} from './types.js';
export {
	setAttr,
	removeAttr,
	renameElement,
	removeElement,
	listAttrs
} from './XmlEditOps.js';
