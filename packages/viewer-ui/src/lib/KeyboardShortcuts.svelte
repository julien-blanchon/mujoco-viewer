<!--
@component
KeyboardShortcuts — central `keydown` handler that dispatches to commands.

One `<svelte:window>` instead of N per-panel bindings means shortcuts don't
collide or fire out of order, and the full key-map is discoverable in one
file. Typing into form fields (INPUT/TEXTAREA/contenteditable) is always
ignored to avoid stealing single-character keys.
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

	function handleKey(e: KeyboardEvent) {
		if (isFormTarget(e.target)) return;

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
