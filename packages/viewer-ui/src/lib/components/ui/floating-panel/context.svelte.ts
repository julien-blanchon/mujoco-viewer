import { getContext, setContext } from 'svelte';

/**
 * Shared z-index stack so clicking any floating panel brings it to the
 * front relative to its siblings. One stack per app — provide once near
 * the root, or fall back to a private instance if unprovided.
 */
export class FloatingPanelStack {
	// Kept strictly below the shadcn overlay baseline (z-[60] — see
	// popover/select/context-menu/tooltip content) so portalled overlays
	// always render above panels even after the user has focused panels many
	// times. Without the clamp the monotonic bump eventually crosses the
	// overlay layer and dropdowns start rendering behind the pane.
	static readonly MAX = 45;
	top = $state(10);

	bump(): number {
		this.top = Math.min(this.top + 1, FloatingPanelStack.MAX);
		return this.top;
	}
}

const STACK_KEY = Symbol('floating-panel-stack');

export function provideFloatingPanelStack(): FloatingPanelStack {
	const existing = getContext<FloatingPanelStack | undefined>(STACK_KEY);
	if (existing) return existing;
	const stack = new FloatingPanelStack();
	setContext(STACK_KEY, stack);
	return stack;
}

export function getFloatingPanelStack(): FloatingPanelStack {
	return getContext<FloatingPanelStack | undefined>(STACK_KEY) ?? new FloatingPanelStack();
}

/**
 * Handshake between `<FloatingPanel.Root>` and its `<FloatingPanel.Header>` —
 * Header renders the drag surface and action buttons, Root owns the state.
 */
export type FloatingPanelApi = {
	readonly collapsed: boolean;
	toggleCollapsed: () => void;
	readonly closable: boolean;
	close: () => void;
	startDrag: (e: PointerEvent) => void;
	/** Max height applied by Body so it scrolls when content exceeds it. */
	readonly maxHeight: string | undefined;
	/** Min height applied by Body so the panel doesn't collapse when the
	 *  content is tiny (e.g. a search with zero matches). */
	readonly minHeight: string | undefined;
	/** Re-runs the initial `position` docking, overriding any drag the user
	 *  did. No-op when the panel wasn't docked via `position`. */
	resetPosition: () => void;
};

const PANEL_KEY = Symbol('floating-panel');

export function setFloatingPanelApi(api: FloatingPanelApi): void {
	setContext(PANEL_KEY, api);
}

export function getFloatingPanelApi(): FloatingPanelApi {
	const api = getContext<FloatingPanelApi | undefined>(PANEL_KEY);
	if (!api) throw new Error('FloatingPanel.Header must be used inside FloatingPanel.Root');
	return api;
}
