<!--
@component
CameraInspector — target body link + "Use as viewport camera" button.
Tracking mode, fovy, pose, etc. come from `AttrEditList`.
-->
<script lang="ts">
	import type { CameraInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: CameraInfo;
		onUseCamera?: (id: number) => void;
	};

	let { sim, info, onUseCamera }: Props = $props();

	const body = $derived(info.bodyId >= 0 ? (sim.bodies[info.bodyId] ?? null) : null);
</script>

{#if body}
	<div class="mb-1 font-mono text-[11px]">
		<span class="text-muted-foreground">target body →</span>
		<button
			type="button"
			class="cursor-pointer border-0 bg-transparent p-0 text-primary [font:inherit] hover:underline"
			onclick={() => commands.run('selection.set', { kind: 'body', id: body.id })}
		>
			#{body.id} {body.name || '(world)'}
		</button>
	</div>
{/if}

{#if onUseCamera}
	<button
		type="button"
		class="mt-2 w-full cursor-pointer rounded border border-border bg-muted px-2.5 py-1.5 text-[11px] text-foreground hover:bg-accent"
		onclick={() => onUseCamera(info.id)}
	>
		Use as viewport camera
	</button>
{/if}
