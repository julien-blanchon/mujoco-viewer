/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Panel layout state — one record per floating panel, with collapse/open
 * toggles and width constants.
 */

export type PanelId = 'tree' | 'inspector' | 'controls';

export interface PanelState {
	collapsed: boolean;
	/** Dialog-style panels may additionally be closed; the inspector closes on
	 * empty selection. Omitted for panels that are always visible. */
	open?: boolean;
}

export class PanelLayout {
	tree = $state<PanelState>({ collapsed: false });
	inspector = $state<PanelState>({ collapsed: false, open: false });
	controls = $state<PanelState>({ collapsed: false });

	readonly widths = {
		tree: 280,
		inspector: 320,
		controls: 320
	} as const;

	openInspector(): void {
		this.inspector.open = true;
	}

	closeInspector(): void {
		this.inspector.open = false;
	}
}
