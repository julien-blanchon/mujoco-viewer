/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App-level reactive view mode. Toggles between:
 *   - `'read'` — current behavior, inspectors are read-only
 *   - `'edit'` — inspector fields become inputs; the SaveMenu surfaces in the
 *                top toolbar; element rename/remove become available
 *
 * Lives in the app (not the package) because mode is a *UX decision* the
 * app makes; the package exposes the underlying primitives (`XmlIndex`,
 * `EditSession`) and stays mode-agnostic.
 */

export type ViewMode = 'read' | 'edit';

export class ViewModeState {
	current = $state<ViewMode>('read');

	get isEditing(): boolean {
		return this.current === 'edit';
	}

	toggle(): void {
		this.current = this.current === 'read' ? 'edit' : 'read';
	}

	set(mode: ViewMode): void {
		this.current = mode;
	}
}

/**
 * Singleton — most apps only ever have one viewer at a time, and routing
 * mode through a singleton avoids prop-drilling it into every inspector.
 * Apps embedding multiple viewers can instantiate their own.
 */
export const viewMode = new ViewModeState();
