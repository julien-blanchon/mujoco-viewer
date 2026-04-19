<!--
@component
Renders children only once the MuJoCo WASM module has loaded. Must be a
descendant of <MujocoProvider>.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useMujocoWasm } from 'mujoco-svelte';

	let {
		children,
		loading,
		error
	}: {
		children: Snippet;
		loading?: Snippet;
		error?: Snippet<[string]>;
	} = $props();

	const wasm = useMujocoWasm();
</script>

{#if wasm.status === 'ready'}
	{@render children()}
{:else if wasm.status === 'error'}
	{@render error?.(wasm.error ?? 'Unknown error')}
{:else}
	{@render loading?.()}
{/if}
