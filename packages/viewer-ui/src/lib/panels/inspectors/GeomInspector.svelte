<!--
@component
GeomInspector — swatch + body/material navigation. All editable attributes
(type, size, pos, rgba, friction, contype/conaffinity, condim, group, ...)
live in the `AttrEditList` the parent renders below.
-->
<script lang="ts">
	import type { GeomInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: GeomInfo;
	};

	let { sim, info }: Props = $props();

	const body = $derived(sim.bodies[info.bodyId] ?? null);
	const matId = $derived.by(() => {
		const m = sim.mjModel;
		return m?.geom_matid ? m.geom_matid[info.id] : -1;
	});
	const mat = $derived(matId >= 0 ? (sim.materials[matId] ?? null) : null);

	// Effective color: material's rgba takes precedence over geom_rgba.
	const swatch = $derived.by(() => {
		const m = sim.mjModel;
		if (!m) return 'transparent';
		const src = mat ? mat.rgba : [m.geom_rgba[info.id * 4], m.geom_rgba[info.id * 4 + 1], m.geom_rgba[info.id * 4 + 2], m.geom_rgba[info.id * 4 + 3]];
		return `rgba(${Math.round(src[0] * 255)}, ${Math.round(src[1] * 255)}, ${Math.round(src[2] * 255)}, ${src[3].toFixed(2)})`;
	});
</script>

<div class="mb-2 h-9 rounded border border-border" style:background={swatch}></div>

<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
	{#if body}
		<dt class="text-muted-foreground">body</dt>
		<dd class="m-0 text-foreground">
			<button
				type="button"
				class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
				onclick={() => commands.run('selection.set', { kind: 'body', id: body.id })}
			>
				#{body.id} {body.name || '(world)'} →
			</button>
		</dd>
	{/if}
	{#if mat}
		<dt class="text-muted-foreground">material</dt>
		<dd class="m-0 text-foreground">
			<button
				type="button"
				class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
				onclick={() => commands.run('selection.set', { kind: 'material', id: mat.id })}
			>
				#{mat.id} {mat.name} →
			</button>
		</dd>
	{/if}
</dl>
