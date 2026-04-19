<!--
@component
EqualityInspector — obj1/obj2 navigation links + runtime "active" toggle
(writes `data.eq_active`). Static attributes (solimp, solref, anchor,
relpose, ...) come from `AttrEditList`.
-->
<script lang="ts">
	import type { EntityKind, EqualityInfo, MujocoSimState } from 'mujoco-svelte';
	import InspectorLink from './InspectorLink.svelte';

	type Props = {
		sim: MujocoSimState;
		info: EqualityInfo;
	};

	let { sim, info }: Props = $props();

	const refKind = $derived<EntityKind | null>(
		info.type === 0 || info.type === 1
			? 'body'
			: info.type === 2
				? 'joint'
				: info.type === 3
					? 'tendon'
					: null
	);

	function resolveName(kind: EntityKind | null, id: number): string {
		if (kind === null || id < 0) return '';
		const arr =
			kind === 'body'
				? sim.bodies
				: kind === 'joint'
					? sim.joints
					: kind === 'tendon'
						? sim.tendons
						: [];
		return arr[id]?.name || '';
	}

	let active = $state(false);

	$effect(() => {
		active = info.active;
	});

	$effect(() => {
		const d = sim.mjData as unknown as { eq_active?: Uint8Array } | null;
		if (!d?.eq_active) return;
		d.eq_active[info.id] = active ? 1 : 0;
	});
</script>

{#if refKind}
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
		<dt class="text-muted-foreground capitalize">{refKind} 1</dt>
		<dd class="m-0 text-foreground">
			<InspectorLink kind={refKind} id={info.obj1Id} name={resolveName(refKind, info.obj1Id)} />
		</dd>
		<dt class="text-muted-foreground capitalize">{refKind} 2</dt>
		<dd class="m-0 text-foreground">
			{#if info.obj2Id >= 0}
				<InspectorLink kind={refKind} id={info.obj2Id} name={resolveName(refKind, info.obj2Id)} />
			{:else}
				(world)
			{/if}
		</dd>
	</dl>
{/if}

<label class="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-foreground select-none">
	<input type="checkbox" bind:checked={active} />
	<span>Active</span>
</label>
