<!--
@component
MujocoProvider — loads the MuJoCo WASM module and exposes it via Svelte
context. Place once at the top of the tree, outside any Threlte `<Canvas>`.

```svelte
<MujocoProvider>
    <MujocoCanvas config={...}>...</MujocoCanvas>
</MujocoProvider>
```

For VSCode extensions, pass `webview.asWebviewUri(...)` as `wasmUrl` to
serve the `.wasm` binary through the extension's own CSP-whitelisted origin.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, setContext } from 'svelte';
	import { MUJOCO_WASM_KEY } from '../context.js';
	import { MujocoWasmState } from '../state/MujocoWasmState.svelte.js';

	type Props = {
		/** Override URL for `mujoco_wasm.wasm`. */
		wasmUrl?: string;
		/** Timeout (ms) for WASM module load. Default: 30000. */
		timeout?: number;
		/** Error callback fired once when load fails. */
		onError?: (error: Error) => void;
		children?: Snippet;
	};

	let { wasmUrl, timeout = 30000, onError, children }: Props = $props();

	// svelte-ignore state_referenced_locally
	const state = new MujocoWasmState({ wasmUrl, timeout, onError });
	setContext(MUJOCO_WASM_KEY, state);

	onMount(() => {
		state.load();
		return () => state.dispose();
	});
</script>

{@render children?.()}
