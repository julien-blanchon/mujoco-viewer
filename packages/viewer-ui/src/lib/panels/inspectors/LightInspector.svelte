<!--
@component
LightInspector — body link + diffuse/specular/ambient color swatches. Raw
numeric values (cutoff, exponent, attenuation, rgba triples) are rendered
by `AttrEditList` below.
-->
<script lang="ts">
	import type { LightInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: LightInfo;
	};

	let { sim, info }: Props = $props();

	const body = $derived(info.bodyId >= 0 ? (sim.bodies[info.bodyId] ?? null) : null);

	function swatchFromTriple(name: keyof NonNullable<MujocoSimState['mjModel']>): string {
		const m = sim.mjModel as unknown as Record<string, Float32Array | undefined>;
		const arr = m?.[name as string];
		if (!arr) return 'transparent';
		const i = info.id * 3;
		const r = Math.round(Math.min(1, arr[i] ?? 0) * 255);
		const g = Math.round(Math.min(1, arr[i + 1] ?? 0) * 255);
		const b = Math.round(Math.min(1, arr[i + 2] ?? 0) * 255);
		return `rgb(${r}, ${g}, ${b})`;
	}

	// Recomputed each physics step via sim.time — swatches reflect
	// externally-modified light colors.
	const diffuseSwatch = $derived((void sim.time, swatchFromTriple('light_diffuse')));
	const specularSwatch = $derived((void sim.time, swatchFromTriple('light_specular')));
	const ambientSwatch = $derived((void sim.time, swatchFromTriple('light_ambient')));
</script>

{#if body}
	<div class="mb-2 font-mono text-[11px]">
		<span class="text-muted-foreground">body →</span>
		<button
			type="button"
			class="cursor-pointer border-0 bg-transparent p-0 text-primary [font:inherit] hover:underline"
			onclick={() => commands.run('selection.set', { kind: 'body', id: body.id })}
		>
			#{body.id} {body.name || '(world)'}
		</button>
	</div>
{/if}

<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
	Color
</h4>
<div class="grid grid-cols-[16px_80px] items-center gap-1.5 font-mono text-[11px]">
	<span class="h-3 w-3 rounded-[3px] border border-border" style:background={diffuseSwatch}></span>
	<span class="text-muted-foreground">diffuse</span>
	<span class="h-3 w-3 rounded-[3px] border border-border" style:background={specularSwatch}></span>
	<span class="text-muted-foreground">specular</span>
	<span class="h-3 w-3 rounded-[3px] border border-border" style:background={ambientSwatch}></span>
	<span class="text-muted-foreground">ambient</span>
</div>
