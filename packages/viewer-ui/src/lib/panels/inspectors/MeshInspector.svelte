<!--
@component
MeshInspector — topology (vert/face counts, ~memory) + "Referenced by"
list for quick navigation to geoms using this mesh. File/scale/etc. attrs
come from `AttrEditList`.
-->
<script lang="ts">
	import type { MeshInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: MeshInfo;
	};

	let { sim, info }: Props = $props();

	// Rough memory: vert (3 floats) + normal (3 floats) + face (3 int32). All
	// 32-bit — back-of-envelope figure, not a tight accounting.
	const bytes = $derived(info.vertCount * 3 * 4 * 2 + info.faceCount * 3 * 4);
	const kb = $derived(bytes / 1024);

	const usingGeoms = $derived.by(() => {
		const m = sim.mjModel;
		if (!m?.geom_dataid) return [];
		const MESH_TYPE = 7; // mjGEOM_MESH
		const hits: { id: number; name: string; bodyId: number }[] = [];
		for (const g of sim.geoms) {
			if (g.type === MESH_TYPE && m.geom_dataid[g.id] === info.id) {
				hits.push({ id: g.id, name: g.name, bodyId: g.bodyId });
			}
		}
		return hits;
	});
</script>

<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
	<dt class="text-muted-foreground">verts</dt>
	<dd class="m-0 text-foreground">{info.vertCount.toLocaleString()}</dd>
	<dt class="text-muted-foreground">faces</dt>
	<dd class="m-0 text-foreground">{info.faceCount.toLocaleString()}</dd>
	<dt class="text-muted-foreground">memory</dt>
	<dd class="m-0 text-foreground">
		~{kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`}
	</dd>
</dl>

{#if usingGeoms.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Referenced by ({usingGeoms.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each usingGeoms as g (g.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => commands.run('selection.set', { kind: 'geom', id: g.id })}
				>
					geom #{g.id} {g.name || '(unnamed)'}
				</button>
			</li>
		{/each}
	</ul>
{/if}
