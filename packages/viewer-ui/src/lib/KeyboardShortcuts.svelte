<!--
@component
KeyboardShortcuts — central `keydown` handler that dispatches to commands.

One `<svelte:window>` instead of N per-panel bindings means shortcuts don't
collide or fire out of order, and the full key-map is discoverable in one
file.

Guards against stealing keys in three situations:
 1. Webview isn't focused (user is in VS Code terminal / editor / etc.) —
    `document.hasFocus()` is false in that case, so we bail.
 2. Some descendant widget already claimed the key (tree row's Space-to-select,
    button's Space-to-activate) — we check `e.defaultPrevented` and, more
    importantly, we only fire when focus is on `body` or the scene canvas.
    Buttons / tree rows / form inputs all set `activeElement` to themselves,
    so the global shortcut naturally defers to them.
 3. Form inputs (INPUT/TEXTAREA/SELECT/contenteditable) — belt-and-braces,
    in case someone forwards an event past the activeElement check.
-->
<script lang="ts">
	import { commands } from './commands/registry.svelte.js';

	function isFormTarget(target: EventTarget | null): boolean {
		if (!target) return false;
		const el = target as HTMLElement;
		const tag = el.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
		if (el.isContentEditable) return true;
		return false;
	}

	// Global viewer shortcuts should only fire when nothing else owns the key.
	// `activeElement === body` means no focused widget; a focused canvas is
	// treated the same so clicking into the 3D scene still enables shortcuts.
	function shouldHandleGlobally(): boolean {
		if (!document.hasFocus()) return false;
		const active = document.activeElement;
		if (!active || active === document.body) return true;
		return active.tagName === 'CANVAS';
	}

	function handleKey(e: KeyboardEvent) {
		if (e.defaultPrevented) return;
		if (isFormTarget(e.target)) return;
		if (!shouldHandleGlobally()) return;

		// Pause / resume
		if (e.code === 'Space') {
			e.preventDefault();
			void commands.run('sim.togglePause');
			return;
		}

		// Reset
		if (e.key === 'r' || e.key === 'R') {
			if (e.metaKey || e.ctrlKey) return; // leave browser reload alone
			void commands.run('sim.reset');
			return;
		}

		// Reset camera view
		if (e.key === 'f' || e.key === 'F') {
			if (e.metaKey || e.ctrlKey) return; // leave browser find alone
			void commands.run('camera.resetView');
			return;
		}

		// Escape — clears selection first, then falls through to free camera.
		if (e.key === 'Escape') {
			void commands.run('selection.clear');
			void commands.run('camera.free');
			return;
		}

		// Named-camera cycling
		if (e.key === '[') {
			void commands.run('camera.cycleNamed', -1);
			return;
		}
		if (e.key === ']') {
			void commands.run('camera.cycleNamed', 1);
			return;
		}
	}
</script>

<svelte:window onkeydown={handleKey} />
