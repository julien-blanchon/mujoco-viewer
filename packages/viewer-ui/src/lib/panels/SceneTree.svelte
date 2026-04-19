<!--
@component
SceneTree

Blender-style outliner. Built on top of the reusable <Tree.*> primitives in
$lib/components/ui/tree. Tree values are `"<kind>:<id>"` strings (or
`"section:<kind>"` for section headers), which makes selection bindable to a
single scalar.
-->
<script lang="ts">
	import type { EntityKind, MujocoSimState } from 'mujoco-svelte';
	import * as Tree from '$lib/components/ui/tree/index.js';
	import * as ContextMenu from '$lib/components/ui/context-menu/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		Empty,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle
	} from '$lib/components/ui/empty/index.js';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import BoxIcon from '@lucide/svelte/icons/box';
	import BracesIcon from '@lucide/svelte/icons/braces';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CrosshairIcon from '@lucide/svelte/icons/crosshair';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import HashIcon from '@lucide/svelte/icons/hash';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import LinkIcon from '@lucide/svelte/icons/link';
	import LocateFixedIcon from '@lucide/svelte/icons/locate-fixed';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import MousePointerOffIcon from '@lucide/svelte/icons/mouse-pointer-click';
	import PaletteIcon from '@lucide/svelte/icons/palette';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RouteIcon from '@lucide/svelte/icons/route';
	import SlidersIcon from '@lucide/svelte/icons/sliders-horizontal';
	import SpinIcon from '@lucide/svelte/icons/rotate-3d';
	import SquareIcon from '@lucide/svelte/icons/square';
	import TriangleIcon from '@lucide/svelte/icons/triangle';
	import VideoIcon from '@lucide/svelte/icons/video';
	import type { Component } from 'svelte';
	import type { CameraController } from '$lib/stores/cameraController.svelte.js';
	import { editSession } from '$lib/stores/editSession.svelte.js';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState | null;
		camera?: CameraController;
	};

	let { sim, camera }: Props = $props();

	let query = $state('');
	let openSections = $state<Record<string, boolean>>({
		bodies: true,
		joint: false,
		geom: false,
		site: false,
		camera: false,
		light: false,
		material: false,
		texture: false,
		mesh: false,
		tendon: false,
		actuator: false,
		sensor: false,
		equality: false,
		keyframe: false
	});

	type BodyNode = { id: number; name: string; children: BodyNode[] };

	const bodyTree = $derived.by<BodyNode[]>(() => {
		if (!sim) return [];
		const byId = new Map<number, BodyNode>();
		for (const b of sim.bodies) byId.set(b.id, { id: b.id, name: b.name, children: [] });
		const roots: BodyNode[] = [];
		for (const b of sim.bodies) {
			const node = byId.get(b.id)!;
			if (b.id === 0 || b.parentId === b.id) {
				roots.push(node);
				continue;
			}
			const parent = byId.get(b.parentId);
			if (parent) parent.children.push(node);
			else roots.push(node);
		}
		return roots;
	});

	function matches(name: string): boolean {
		if (!query) return true;
		return name.toLowerCase().includes(query.toLowerCase());
	}

	// Recursive count of bodies whose own name matches the query. Mirrors
	// the rendering filter but is strict about the target node (ancestors of
	// a match aren't counted, only the match itself).
	function countMatchingBodies(nodes: BodyNode[]): number {
		let n = 0;
		for (const node of nodes) {
			if (matches(node.name)) n++;
			n += countMatchingBodies(node.children);
		}
		return n;
	}

	const bodyCount = $derived(
		query ? countMatchingBodies(bodyTree) : (sim?.bodies.length ?? 0)
	);

	// ---- Selection bridge ---------------------------------------------------

	type EntityKey = `${EntityKind}:${number}` | `section:${string}`;

	const treeSelected = $derived<EntityKey | null>(
		sim?.selection ? (`${sim.selection.kind}:${sim.selection.id}` as EntityKey) : null
	);

	function setTreeSelected(v: EntityKey | null) {
		if (!sim) return;
		if (v === null || v.startsWith('section:')) {
			sim.selection = null;
			return;
		}
		const [kind, idStr] = v.split(':');
		const id = Number(idStr);
		if (!Number.isFinite(id)) return;
		sim.selection = { kind: kind as EntityKind, id };
	}

	// ---- Flat sections ------------------------------------------------------

	const flatSections: Array<{
		kind: EntityKind;
		label: string;
		icon: Component;
		items: Array<{ id: number; name: string }>;
	}> = $derived([
		{ kind: 'joint', label: 'Joints', icon: SpinIcon, items: sim?.joints ?? [] },
		{ kind: 'geom', label: 'Geoms', icon: SquareIcon, items: sim?.geoms ?? [] },
		{ kind: 'site', label: 'Sites', icon: MapPinIcon, items: sim?.sites ?? [] },
		{ kind: 'camera', label: 'Cameras', icon: CameraIcon, items: sim?.cameras ?? [] },
		{ kind: 'light', label: 'Lights', icon: LightbulbIcon, items: sim?.lights ?? [] },
		{ kind: 'material', label: 'Materials', icon: PaletteIcon, items: sim?.materials ?? [] },
		{ kind: 'texture', label: 'Textures', icon: CircleIcon, items: sim?.textures ?? [] },
		{ kind: 'mesh', label: 'Meshes', icon: TriangleIcon, items: sim?.meshes ?? [] },
		{ kind: 'tendon', label: 'Tendons', icon: RouteIcon, items: sim?.tendons ?? [] },
		{
			kind: 'actuator',
			label: 'Actuators',
			icon: SlidersIcon,
			items: sim?.actuators ?? []
		},
		{ kind: 'sensor', label: 'Sensors', icon: BracesIcon, items: sim?.sensors ?? [] },
		{ kind: 'equality', label: 'Equalities', icon: LinkIcon, items: sim?.equalities ?? [] },
		{
			kind: 'keyframe',
			label: 'Keyframes',
			icon: HashIcon,
			items: (sim?.keyframeNames ?? []).map((name, id) => ({ id, name }))
		}
	]);

	const flatMatchCount = $derived(
		query
			? flatSections.reduce(
					(sum, s) => sum + s.items.filter((it) => matches(it.name)).length,
					0
				)
			: flatSections.reduce((sum, s) => sum + s.items.length, 0)
	);

	const noMatches = $derived(!!query && bodyCount === 0 && flatMatchCount === 0);

	// ---- Visibility: MuJoCo lights expose a runtime active flag -------------

	function lightVisible(id: number): boolean {
		return !!sim?.mjModel?.light_active?.[id];
	}

	function toggleLightVisible(id: number, visible: boolean) {
		const m = sim?.mjModel;
		if (!m?.light_active) return;
		m.light_active[id] = visible ? 1 : 0;
	}

	// ---- Context-menu helpers ----------------------------------------------

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard can fail in insecure contexts / sandboxed iframes — silent.
		}
	}

	function focusOnSelection(kind: EntityKind, id: number) {
		if (!sim || !camera) return;
		camera.followSelection(sim, { kind, id });
	}

	function openInXml(kind: EntityKind, id: number) {
		const idx = sim?.xmlIndex;
		if (!idx) return;
		const rec = idx.lookup(kind, id);
		if (!rec) return;
		editSession.openFile(rec.sourceFile, rec.fullRange.line, rec.fullRange.col);
	}

	function xmlRecordAvailable(kind: EntityKind, id: number): boolean {
		return !!sim?.xmlIndex?.lookup(kind, id);
	}

	function useCamera(id: number) {
		if (!camera) return;
		camera.mode = { kind: 'fixed', id };
	}

	function trackBody(id: number) {
		if (!camera) return;
		camera.mode = { kind: 'track', bodyId: id };
	}

	function applyKeyframe(id: number) {
		if (!sim) return;
		void sim.api.applyKeyframe(id);
	}

	function selectParentBody(childId: number) {
		if (!sim) return;
		const pid = sim.bodies.find((b) => b.id === childId)?.parentId;
		if (typeof pid === 'number' && pid >= 0) sim.selection = { kind: 'body', id: pid };
	}

	function hasParentBody(childId: number): boolean {
		const body = sim?.bodies.find((b) => b.id === childId);
		return !!body && body.parentId >= 0 && body.parentId !== body.id;
	}

	function resetCameraAndSelection() {
		void commands.run('selection.clear');
		void commands.run('camera.resetView');
	}
</script>

{#snippet entityContextMenu(kind: EntityKind, id: number, name: string)}
	<ContextMenu.Content class="min-w-52">
		<ContextMenu.Label class="px-1.5 py-0.5 text-[10px] tracking-wider uppercase">
			{kind} #{id}{name ? ` · ${name}` : ''}
		</ContextMenu.Label>

		<ContextMenu.Separator />

		<!-- Navigation: camera focus, parent body, open in XML -->
		{#if camera && kind !== 'keyframe' && kind !== 'material' && kind !== 'texture' && kind !== 'mesh'}
			<ContextMenu.Item onclick={() => focusOnSelection(kind, id)}>
				<CrosshairIcon />
				<span>Focus camera</span>
			</ContextMenu.Item>
		{/if}
		{#if kind === 'body' && camera}
			<ContextMenu.Item onclick={() => trackBody(id)}>
				<LocateFixedIcon />
				<span>Track body</span>
			</ContextMenu.Item>
		{/if}
		{#if kind === 'camera' && camera}
			<ContextMenu.Item onclick={() => useCamera(id)}>
				<VideoIcon />
				<span>Use this camera</span>
				<ContextMenu.Shortcut>[ / ]</ContextMenu.Shortcut>
			</ContextMenu.Item>
		{/if}
		{#if kind === 'keyframe'}
			<ContextMenu.Item onclick={() => applyKeyframe(id)}>
				<PlayIcon />
				<span>Apply keyframe</span>
			</ContextMenu.Item>
		{/if}
		{#if kind === 'body' && hasParentBody(id)}
			<ContextMenu.Item onclick={() => selectParentBody(id)}>
				<BoxIcon />
				<span>Select parent body</span>
			</ContextMenu.Item>
		{/if}

		<!-- Source navigation -->
		<ContextMenu.Separator />
		<ContextMenu.Item
			onclick={() => openInXml(kind, id)}
			disabled={!xmlRecordAvailable(kind, id)}
		>
			<ExternalLinkIcon />
			<span>Go to XML definition</span>
		</ContextMenu.Item>

		<!-- Visibility -->
		{#if kind === 'light'}
			<ContextMenu.Separator />
			<ContextMenu.Item onclick={() => toggleLightVisible(id, !lightVisible(id))}>
				{#if lightVisible(id)}
					<EyeOffIcon />
					<span>Hide light</span>
				{:else}
					<EyeIcon />
					<span>Show light</span>
				{/if}
			</ContextMenu.Item>
		{/if}

		<!-- Copy -->
		<ContextMenu.Separator />
		<ContextMenu.Sub>
			<ContextMenu.SubTrigger>
				<CopyIcon />
				<span>Copy</span>
			</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class="min-w-44">
				<ContextMenu.Item onclick={() => copyText(name || '')} disabled={!name}>
					<CopyIcon />
					<span>Name</span>
					<ContextMenu.Shortcut>{name || '—'}</ContextMenu.Shortcut>
				</ContextMenu.Item>
				<ContextMenu.Item onclick={() => copyText(String(id))}>
					<CopyIcon />
					<span>Id</span>
					<ContextMenu.Shortcut>#{id}</ContextMenu.Shortcut>
				</ContextMenu.Item>
				<ContextMenu.Item onclick={() => copyText(`${kind}:${id}`)}>
					<CopyIcon />
					<span>Key</span>
					<ContextMenu.Shortcut>{kind}:{id}</ContextMenu.Shortcut>
				</ContextMenu.Item>
			</ContextMenu.SubContent>
		</ContextMenu.Sub>

		<!-- Deselect / reset view -->
		<ContextMenu.Separator />
		<ContextMenu.Item onclick={() => setTreeSelected(null)}>
			<MousePointerOffIcon />
			<span>Clear selection</span>
			<ContextMenu.Shortcut>Esc</ContextMenu.Shortcut>
		</ContextMenu.Item>
		{#if camera}
			<ContextMenu.Item onclick={resetCameraAndSelection}>
				<CameraIcon />
				<span>Reset view</span>
				<ContextMenu.Shortcut>F</ContextMenu.Shortcut>
			</ContextMenu.Item>
		{/if}
	</ContextMenu.Content>
{/snippet}

<div class="flex h-full flex-col gap-1 overflow-y-auto">
	<div class="p-2">
		<Input type="search" bind:value={query} placeholder="Search…" class="h-7 text-xs" />
	</div>

	{#if noMatches}
		<Empty class="px-3 py-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SearchXIcon />
				</EmptyMedia>
				<EmptyTitle class="text-sm">No matches</EmptyTitle>
				<EmptyDescription class="text-xs">
					Nothing in the scene matches “{query}”.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	{/if}

	<Tree.Root
		selected={treeSelected}
		onRename={(_, _name) => {
			/* MuJoCo entities aren't renameable at runtime; wire this up in consumers
			   that own editable scenes. */
		}}
	>
		{#if sim && !noMatches}
			<!-- Bodies section -->
			{#if bodyCount > 0}
			<Tree.Item
				value={'section:bodies' as EntityKey}
				bind:open={openSections.bodies}
				depth={0}
			>
				<Tree.ItemRow selectable={false} class="h-5 text-[10px] tracking-wider uppercase">
					<Tree.Indicator hasChildren={bodyTree.length > 0} />
					<Tree.Icon><BoxIcon /></Tree.Icon>
					<Tree.Label value="Bodies" />
					<Tree.Actions alwaysVisible>
						<Badge variant="secondary" class="h-4 px-1.5 text-[10px]">
							{bodyCount}
						</Badge>
					</Tree.Actions>
				</Tree.ItemRow>
				<Tree.ItemContent>
					{#each bodyTree as node (node.id)}
						{@render bodyNode(node)}
					{/each}
				</Tree.ItemContent>
			</Tree.Item>
			{/if}

			<!-- Flat sections -->
			{#each flatSections as section (section.kind)}
				{@const filtered = section.items.filter((it) => matches(it.name))}
				{#if filtered.length > 0}
					<Tree.Item
						value={`section:${section.kind}` as EntityKey}
						bind:open={openSections[section.kind]}
						depth={0}
					>
						<Tree.ItemRow
							selectable={false}
							class="h-5 text-[10px] tracking-wider uppercase"
						>
							<Tree.Indicator hasChildren />
							<Tree.Icon>
								<section.icon />
							</Tree.Icon>
							<Tree.Label value={section.label} />
							<Tree.Actions alwaysVisible>
								<Badge variant="secondary" class="h-4 px-1.5 text-[10px]">
									{filtered.length}
								</Badge>
							</Tree.Actions>
						</Tree.ItemRow>
						<Tree.ItemContent>
							{#each filtered as item (item.id)}
								<Tree.Item value={`${section.kind}:${item.id}` as EntityKey}>
									<ContextMenu.Root
										onOpenChange={(open) => {
											if (open) setTreeSelected(`${section.kind}:${item.id}` as EntityKey);
										}}
									>
										<ContextMenu.Trigger class="block">
											<Tree.ItemRow
												onclick={() =>
													setTreeSelected(`${section.kind}:${item.id}` as EntityKey)
												}
											>
												<Tree.Indicator hasChildren={false} />
												<span
													class="text-muted-foreground group-data-[selected=true]/tree-row:text-primary-foreground/70 shrink-0 font-mono text-[10px]"
												>
													#{item.id}
												</span>
												<Tree.Label value={item.name || '(unnamed)'} />
												{#if section.kind === 'light'}
													<Tree.Actions>
														<Tree.VisibilityToggle
															pressed={lightVisible(item.id)}
															onPressedChange={(v) => toggleLightVisible(item.id, v)}
														/>
													</Tree.Actions>
												{/if}
											</Tree.ItemRow>
										</ContextMenu.Trigger>
										{@render entityContextMenu(section.kind, item.id, item.name)}
									</ContextMenu.Root>
								</Tree.Item>
							{/each}
						</Tree.ItemContent>
					</Tree.Item>
				{/if}
			{/each}
		{/if}
	</Tree.Root>
</div>

{#snippet bodyNode(node: BodyNode)}
	{#if matches(node.name) || node.children.some((c) => matches(c.name))}
		<Tree.Item value={`body:${node.id}` as EntityKey}>
			<ContextMenu.Root
				onOpenChange={(open) => {
					if (open) setTreeSelected(`body:${node.id}` as EntityKey);
				}}
			>
				<ContextMenu.Trigger class="block">
					<Tree.ItemRow onclick={() => setTreeSelected(`body:${node.id}` as EntityKey)}>
						<Tree.Indicator hasChildren={node.children.length > 0} />
						<span
							class="text-muted-foreground group-data-[selected=true]/tree-row:text-primary-foreground/70 shrink-0 font-mono text-[10px]"
						>
							#{node.id}
						</span>
						<Tree.Label value={node.name || '(world)'} />
					</Tree.ItemRow>
				</ContextMenu.Trigger>
				{@render entityContextMenu('body', node.id, node.name)}
			</ContextMenu.Root>
			{#if node.children.length > 0}
				<Tree.ItemContent>
					{#each node.children as child (child.id)}
						{@render bodyNode(child)}
					{/each}
				</Tree.ItemContent>
			{/if}
		</Tree.Item>
	{/if}
{/snippet}
