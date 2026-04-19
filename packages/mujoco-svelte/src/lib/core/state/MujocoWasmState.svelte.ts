/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reactive provider state for `<MujocoProvider>`. Loads MuJoCo WASM on the
 * main thread and exposes the module through Svelte context.
 */

import loadMujoco from 'mujoco-js';
import type { MujocoModule } from '../../types.js';

type WasmStatus = 'loading' | 'ready' | 'error';

export class MujocoWasmState {
	status = $state<WasmStatus>('loading');
	error = $state<string | null>(null);
	mujoco: MujocoModule | null = null;

	/** Optional override for where the loader fetches `mujoco_wasm.wasm` from. */
	readonly wasmUrl: string | undefined;

	#disposed = false;
	#timeout: number;
	#onError: ((e: Error) => void) | undefined;

	constructor(options?: {
		wasmUrl?: string;
		timeout?: number;
		onError?: (error: Error) => void;
	}) {
		this.wasmUrl = options?.wasmUrl;
		this.#timeout = options?.timeout ?? 30000;
		this.#onError = options?.onError;
	}

	async load(): Promise<void> {
		if (this.status !== 'loading') return;
		if (this.mujoco) return;

		const wasmUrl = this.wasmUrl;

		// Rolling buffer of recent stderr lines. MuJoCo writes XML / compile errors
		// through Emscripten's printErr, but the Embind exception it throws often
		// carries only the type name. We stash the last few lines so the scene
		// loader can attach them to the thrown Error.
		const stderrBuffer: string[] = [];
		const wasmPromise = loadMujoco({
			...(wasmUrl
				? { locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path) }
				: {}),
			printErr: (text: string) => {
				if (text.includes('Aborted') && !this.#disposed) {
					this.error = 'Simulation crashed. Reload page.';
					this.status = 'error';
					return;
				}
				stderrBuffer.push(text);
				if (stderrBuffer.length > 50) stderrBuffer.shift();
			}
		});

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`WASM module load timed out after ${this.#timeout}ms`)),
				this.#timeout
			)
		);

		try {
			const inst = (await Promise.race([wasmPromise, timeoutPromise])) as unknown as MujocoModule;
			if (this.#disposed) return;
			(inst as unknown as { __drainStderr?: () => string }).__drainStderr = () => {
				const text = stderrBuffer.join('\n').trim();
				stderrBuffer.length = 0;
				return text;
			};
			this.mujoco = inst;
			this.status = 'ready';
		} catch (e) {
			if (this.#disposed) return;
			const err = e instanceof Error ? e : new Error(String(e));
			const msg = err.message || 'Failed to init spatial simulation';
			this.error = msg;
			this.status = 'error';
			this.#onError?.(new Error(msg));
		}
	}

	dispose(): void {
		this.#disposed = true;
	}
}
