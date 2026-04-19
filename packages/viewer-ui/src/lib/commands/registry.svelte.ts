/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central command registry — every user-initiated action routes through here:
 * selection changes, camera focus, pause/reset toggles. A single hop keeps:
 *
 *   - keyboard shortcuts, menu items, palette entries, and in-UI buttons all
 *     sharing one implementation per action (no duplicated logic);
 *   - future undo/redo a matter of wrapping `run` with `{ apply, invert }`
 *     instead of refactoring every caller;
 *   - telemetry / logging injectable at one site.
 *
 * Commands are plain async-capable functions registered by id. Shortcuts are
 * metadata only — the keyboard handler looks them up by id so the binding
 * lives in one place.
 */

export interface Command<A extends unknown[] = unknown[]> {
	id: string;
	/** Human-readable label for menus / palette. */
	label?: string;
	/** Informational keyboard hint shown in menus / palette (no binding). */
	shortcut?: string;
	run: (...args: A) => void | Promise<void>;
}

type AnyCommand = Command<unknown[]>;

export class CommandRegistry {
	#commands = new Map<string, AnyCommand>();

	/**
	 * Register a command. Returns an unsubscribe to drop the registration —
	 * use inside `$effect` so stale registrations get cleared on remount.
	 */
	register<A extends unknown[]>(cmd: Command<A>): () => void {
		this.#commands.set(cmd.id, cmd as AnyCommand);
		return () => {
			// Guard against a later re-register racing the cleanup — only drop
			// the exact command we registered.
			if (this.#commands.get(cmd.id) === (cmd as AnyCommand)) {
				this.#commands.delete(cmd.id);
			}
		};
	}

	get(id: string): AnyCommand | undefined {
		return this.#commands.get(id);
	}

	has(id: string): boolean {
		return this.#commands.has(id);
	}

	/**
	 * Invoke a command by id. Unknown ids log a console warning rather than
	 * throwing — missing commands are usually a lifecycle race, not a bug.
	 */
	run(id: string, ...args: unknown[]): void | Promise<void> {
		const cmd = this.#commands.get(id);
		if (!cmd) {
			console.warn(`[commands] unknown command: ${id}`);
			return;
		}
		return cmd.run(...args);
	}

	list(): AnyCommand[] {
		return Array.from(this.#commands.values());
	}
}

/** Singleton. Apps with multiple independent canvases can instantiate their own. */
export const commands = new CommandRegistry();
