<!--
@component
Inspector

Dispatches to per-kind sub-inspectors by narrowing `sim.selectedInfo` — the
`SelectedInfo` discriminated union means each branch's `info` is the exact
`*Info` type for that entity kind (no manual `as X` casts).
-->
<script lang="ts">
	import type { EntityKind, MujocoSimState, XmlEntityRecord } from 'mujoco-svelte';
	import ActuatorInspector from './inspectors/ActuatorInspector.svelte';
	import BodyInspector from './inspectors/BodyInspector.svelte';
	import CameraInspector from './inspectors/CameraInspector.svelte';
	import EqualityInspector from './inspectors/EqualityInspector.svelte';
	import GeomInspector from './inspectors/GeomInspector.svelte';
	import JointInspector from './inspectors/JointInspector.svelte';
	import KeyframeInspector from './inspectors/KeyframeInspector.svelte';
	import LightInspector from './inspectors/LightInspector.svelte';
	import MaterialInspector from './inspectors/MaterialInspector.svelte';
	import MeshInspector from './inspectors/MeshInspector.svelte';
	import SensorInspector from './inspectors/SensorInspector.svelte';
	import SiteInspector from './inspectors/SiteInspector.svelte';
	import TendonInspector from './inspectors/TendonInspector.svelte';
	import TextureInspector from './inspectors/TextureInspector.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import {
		Empty,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle
	} from '$lib/components/ui/empty/index.js';
	import MousePointerIcon from '@lucide/svelte/icons/mouse-pointer-click';
	import { viewMode } from '$lib/stores/viewMode.svelte.js';
	import { editSession } from '$lib/stores/editSession.svelte.js';
	import EntityHeader from '$lib/edit/EntityHeader.svelte';
	import AttrEditList from '$lib/edit/AttrEditList.svelte';

	type Props = {
		sim: MujocoSimState | null;
		onUseCamera?: (id: number) => void;
	};

	let { sim, onUseCamera }: Props = $props();

	const selection = $derived(sim?.selectedInfo ?? null);

	// Reactive lookup of the XML record for the current selection. Re-resolves
	// after every reload (xmlIndex identity changes whenever the engine fires
	// `ready`). The index now recursively expands `<include>` files so
	// include-defined entities resolve to a record with the originating
	// `sourceFile` — edits route back to that file transparently.
	const xmlRecord = $derived.by<XmlEntityRecord | null>(() => {
		void editSession.lastValidDraftXml; // re-derive after each reload
		const idx = sim?.xmlIndex;
		const sel = selection;
		if (!idx || !sel) return null;
		return idx.lookup(sel.kind as EntityKind, sel.info.id) ?? null;
	});
</script>

<div class="h-full overflow-y-auto p-2 text-xs text-foreground">
	{#if !selection || !sim}
		<Empty class="py-8">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<MousePointerIcon />
				</EmptyMedia>
				<EmptyTitle class="text-sm">Nothing selected</EmptyTitle>
				<EmptyDescription class="text-xs">
					Select an entity from the tree to inspect it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	{:else}
		<EntityHeader {sim} {selection} record={xmlRecord} />
		<Separator class="mb-2" />
		{#if !xmlRecord && viewMode.isEditing}
			<div
				class="mb-2 rounded border border-dashed border-border bg-muted/30 px-2 py-1.5 text-[10.5px] text-muted-foreground"
			>
				This entity isn't present in the XML source — it was synthesized by MuJoCo
				(e.g. inherited from a <code class="font-mono">&lt;default&gt;</code> class or
				auto-generated). Editing isn't available.
			</div>
		{/if}

		{#if selection.kind === 'body'}
			<BodyInspector {sim} info={selection.info} />
		{:else if selection.kind === 'joint'}
			<JointInspector {sim} info={selection.info} />
		{:else if selection.kind === 'geom'}
			<GeomInspector {sim} info={selection.info} />
		{:else if selection.kind === 'site'}
			<SiteInspector {sim} info={selection.info} />
		{:else if selection.kind === 'camera'}
			<CameraInspector {sim} info={selection.info} {onUseCamera} />
		{:else if selection.kind === 'light'}
			<LightInspector {sim} info={selection.info} />
		{:else if selection.kind === 'material'}
			<MaterialInspector {sim} info={selection.info} />
		{:else if selection.kind === 'texture'}
			<TextureInspector {sim} info={selection.info} />
		{:else if selection.kind === 'mesh'}
			<MeshInspector {sim} info={selection.info} />
		{:else if selection.kind === 'tendon'}
			<TendonInspector {sim} info={selection.info} />
		{:else if selection.kind === 'actuator'}
			<ActuatorInspector {sim} info={selection.info} />
		{:else if selection.kind === 'sensor'}
			<SensorInspector {sim} info={selection.info} />
		{:else if selection.kind === 'equality'}
			<EqualityInspector {sim} info={selection.info} />
		{:else if selection.kind === 'keyframe'}
			<KeyframeInspector {sim} info={selection.info} />
		{/if}

		{#if xmlRecord}
			<div class="mt-3 border-t border-border pt-2">
				<AttrEditList {sim} record={xmlRecord} />
			</div>
		{/if}
	{/if}
</div>
