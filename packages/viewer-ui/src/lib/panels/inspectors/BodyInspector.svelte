<!--
@component
BodyInspector — parent link + navigation lists for every MJCF entity
attached to this body (children, joints, geoms, sites, cameras, lights,
materials used by its geoms).

Attributes (pos, quat, mass, gravcomp, mocap, ...) are rendered by the
generic `AttrEditList` the parent Inspector attaches below.
-->
<script lang="ts">
	import type { BodyInfo, EntityKind, MaterialInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: BodyInfo;
	};

	let { sim, info }: Props = $props();

	const parent = $derived(sim.bodies[info.parentId] ?? null);
	const children = $derived(sim.bodies.filter((b) => b.parentId === info.id && b.id !== info.id));
	const joints = $derived(sim.joints.filter((j) => j.bodyId === info.id));
	const geoms = $derived(sim.geoms.filter((g) => g.bodyId === info.id));
	const sites = $derived(sim.sites.filter((s) => s.bodyId === info.id));
	const cameras = $derived(sim.cameras.filter((c) => c.bodyId === info.id));
	const lights = $derived(sim.lights.filter((l) => l.bodyId === info.id));

	const materials = $derived.by<MaterialInfo[]>(() => {
		const model = sim.mjModel;
		if (!model?.geom_matid) return [];
		const seen = new Set<number>();
		const out: MaterialInfo[] = [];
		for (const g of geoms) {
			const mid = model.geom_matid[g.id];
			if (mid < 0 || seen.has(mid)) continue;
			seen.add(mid);
			const mat = sim.materials[mid];
			if (mat) out.push(mat);
		}
		return out;
	});

	function select(kind: EntityKind, id: number): void {
		void commands.run('selection.set', { kind, id });
	}

	function matSwatch(rgba: [number, number, number, number]): string {
		return `rgba(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)}, ${rgba[3].toFixed(2)})`;
	}
</script>

{#if parent}
	<div class="mb-2 font-mono text-[11px]">
		<span class="text-muted-foreground">parent →</span>
		<button
			type="button"
			class="cursor-pointer border-0 bg-transparent p-0 text-primary [font:inherit] hover:underline"
			onclick={() => select('body', parent.id)}
		>
			#{parent.id} {parent.name || '(world)'}
		</button>
	</div>
{/if}

{#if children.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Children ({children.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each children as child (child.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('body', child.id)}
				>
					#{child.id} {child.name || '(unnamed body)'}
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if joints.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Joints ({joints.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each joints as j (j.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('joint', j.id)}
				>
					#{j.id} {j.name || '(unnamed joint)'}
					<span class="text-muted-foreground">{j.typeName}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if geoms.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Geoms ({geoms.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each geoms as g (g.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('geom', g.id)}
				>
					#{g.id} {g.name || '(unnamed geom)'}
					<span class="text-muted-foreground">{g.typeName}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if sites.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Sites ({sites.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each sites as s (s.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('site', s.id)}
				>
					#{s.id} {s.name || '(unnamed site)'}
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if cameras.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Cameras ({cameras.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each cameras as c (c.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('camera', c.id)}
				>
					#{c.id} {c.name || '(unnamed camera)'}
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if lights.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Lights ({lights.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each lights as l (l.id)}
			<li>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('light', l.id)}
				>
					#{l.id} {l.name || '(unnamed light)'}
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if materials.length > 0}
	<h4 class="mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
		Materials ({materials.length})
	</h4>
	<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
		{#each materials as mat (mat.id)}
			<li class="flex items-center gap-2">
				<span
					class="inline-block h-3 w-3 shrink-0 rounded-sm border border-border"
					style:background={matSwatch(mat.rgba)}
				></span>
				<button
					type="button"
					class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
					onclick={() => select('material', mat.id)}
				>
					#{mat.id} {mat.name || '(unnamed material)'}
				</button>
			</li>
		{/each}
	</ul>
{/if}
