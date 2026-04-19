<!--
@component
JointInspector — body link + runtime addresses (qposAdr / dofAdr) + live
qpos / qvel readout, plus a needle bar for 1-DOF limited joints. Static
attributes (type, range, axis, pos, stiffness, damping, ...) are rendered
by `AttrEditList`.
-->
<script lang="ts">
	import type { JointInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: JointInfo;
	};

	let { sim, info }: Props = $props();

	// free=7/6 qpos/qvel, ball=4/3, slide=1/1, hinge=1/1
	const qposDim = $derived(info.type === 0 ? 7 : info.type === 1 ? 4 : 1);
	const qvelDim = $derived(info.type === 0 ? 6 : info.type === 1 ? 3 : 1);

	let qpos = $state<number[]>([]);
	let qvel = $state<number[]>([]);

	$effect(() => {
		qpos = Array.from({ length: qposDim }, () => 0);
		qvel = Array.from({ length: qvelDim }, () => 0);
	});

	$effect(() => {
		void sim.time;
		const data = sim.mjData;
		if (!data) return;
		for (let i = 0; i < qposDim; i++) qpos[i] = data.qpos[info.qposAdr + i] ?? 0;
		for (let i = 0; i < qvelDim; i++) qvel[i] = data.qvel[info.dofAdr + i] ?? 0;
	});

	const body = $derived(sim.bodies[info.bodyId] ?? null);

	const needle = $derived.by(() => {
		if (!info.limited || qposDim !== 1) return null;
		const [lo, hi] = info.range;
		if (!(hi > lo)) return null;
		const t = (qpos[0] - lo) / (hi - lo);
		return Math.max(0, Math.min(1, t));
	});
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

<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
	<dt class="text-muted-foreground">qposAdr</dt>
	<dd class="m-0 text-foreground">{info.qposAdr} (+{qposDim})</dd>
	<dt class="text-muted-foreground">dofAdr</dt>
	<dd class="m-0 text-foreground">{info.dofAdr} (+{qvelDim})</dd>
</dl>

{#if needle !== null}
	<div
		class="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
		title="Current qpos within joint limit"
	>
		<span>{info.range[0].toFixed(2)}</span>
		<div class="relative h-1.5 rounded-[3px] border border-border bg-muted">
			<div
				class="absolute top-0 bottom-0 w-[3px] -translate-x-px rounded-[2px] bg-primary"
				style:left="{needle * 100}%"
			></div>
		</div>
		<span>{info.range[1].toFixed(2)}</span>
	</div>
{/if}

<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
	Live
</h4>
<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
	<dt class="text-muted-foreground">qpos</dt>
	<dd class="m-0 break-all text-foreground">{qpos.map((v) => v.toFixed(4)).join(', ')}</dd>
	<dt class="text-muted-foreground">qvel</dt>
	<dd class="m-0 break-all text-foreground">{qvel.map((v) => v.toFixed(4)).join(', ')}</dd>
</dl>
