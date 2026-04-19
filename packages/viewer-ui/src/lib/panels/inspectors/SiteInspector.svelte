<!--
@component
SiteInspector — body navigation link + live orientation basis (x/y/z axes
from `data.site_xmat`). Static attributes (pos, size, rgba, group, type)
come from the generic `AttrEditList`.
-->
<script lang="ts">
	import type { MujocoSimState, SiteInfo } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: SiteInfo;
	};

	let { sim, info }: Props = $props();

	const body = $derived(info.bodyId >= 0 ? (sim.bodies[info.bodyId] ?? null) : null);

	let xAxis = $state<[number, number, number]>([1, 0, 0]);
	let yAxis = $state<[number, number, number]>([0, 1, 0]);
	let zAxis = $state<[number, number, number]>([0, 0, 1]);

	$effect(() => {
		void sim.time;
		const d = sim.mjData;
		if (!d) return;
		const i9 = info.id * 9;
		xAxis[0] = d.site_xmat[i9 + 0];
		xAxis[1] = d.site_xmat[i9 + 3];
		xAxis[2] = d.site_xmat[i9 + 6];
		yAxis[0] = d.site_xmat[i9 + 1];
		yAxis[1] = d.site_xmat[i9 + 4];
		yAxis[2] = d.site_xmat[i9 + 7];
		zAxis[0] = d.site_xmat[i9 + 2];
		zAxis[1] = d.site_xmat[i9 + 5];
		zAxis[2] = d.site_xmat[i9 + 8];
	});
</script>

{#if body}
	<div class="mb-1 font-mono text-[11px]">
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
	Live basis
</h4>
<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
	<dt class="text-muted-foreground">x-axis</dt>
	<dd class="m-0 break-all text-red-400">{xAxis.map((v) => v.toFixed(3)).join(', ')}</dd>
	<dt class="text-muted-foreground">y-axis</dt>
	<dd class="m-0 break-all text-green-400">{yAxis.map((v) => v.toFixed(3)).join(', ')}</dd>
	<dt class="text-muted-foreground">z-axis</dt>
	<dd class="m-0 break-all text-blue-400">{zAxis.map((v) => v.toFixed(3)).join(', ')}</dd>
</dl>
