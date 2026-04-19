<script lang="ts">
	import { ViewerApp } from '@mujoco-viewer/viewer-ui';
	import type { HostAdapter } from '@mujoco-viewer/protocol';
	import {
		createBrowserAdapter,
		fileSystemAccessSupported,
		pickRoot
	} from './browserAdapter.svelte';

	let adapter = $state<HostAdapter | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(false);

	async function choose() {
		error = null;
		loading = true;
		try {
			const { dir, rootPath } = await pickRoot();
			adapter = createBrowserAdapter({ dir, rootPath });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

{#if adapter}
	<div class="dark" style="height: 100%; width: 100%;">
		<ViewerApp {adapter} />
	</div>
{:else}
	<main class="picker">
		<h1>MuJoCo Viewer — Debug</h1>
		<p>
			Pick a folder that contains a MuJoCo model (e.g. <code>scene.xml</code>). Subfolders with
			meshes / textures get loaded automatically.
		</p>

		{#if !fileSystemAccessSupported()}
			<div class="warn">
				<strong>Browser not supported.</strong>
				This debug app needs the File System Access API (Chrome / Edge / Arc / Brave). Firefox
				and Safari don't expose it yet.
			</div>
		{/if}

		<button onclick={choose} disabled={loading || !fileSystemAccessSupported()}>
			{loading ? 'Opening…' : 'Open folder'}
		</button>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<p class="hint">
			Tip: try <code>debug/fixtures/</code> — it ships with a single-file humanoid model you can
			poke at.
		</p>
	</main>
{/if}

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 36rem;
		padding: 3rem 2rem;
		margin: 0 auto;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	p {
		margin: 0;
		opacity: 0.75;
		line-height: 1.5;
	}
	code {
		background: #2d2d2d;
		padding: 0.1rem 0.3rem;
		border-radius: 0.2rem;
	}
	button {
		align-self: flex-start;
		padding: 0.6rem 1.2rem;
		background: var(--vscode-statusBar-background, #007acc);
		color: var(--vscode-statusBar-foreground, #fff);
		border: none;
		border-radius: 0.3rem;
		font-size: 0.95rem;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.warn {
		padding: 0.8rem 1rem;
		border-left: 3px solid #c4a000;
		background: rgba(196, 160, 0, 0.08);
		font-size: 0.9rem;
	}
	.error {
		padding: 0.8rem 1rem;
		border-left: 3px solid #f14c4c;
		background: rgba(241, 76, 76, 0.08);
		font-size: 0.9rem;
	}
	.hint {
		font-size: 0.85rem;
		opacity: 0.5;
	}
</style>
