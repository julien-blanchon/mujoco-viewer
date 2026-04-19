<!--
@component
EntityHeader — top of every inspector panel.

Read mode: kind badge + name + "defined at scene.xml:42" line (if the entity
is in the XML index).

Edit mode: kind badge + rename input + line indicator + remove (×) button.

The header doesn't know about per-entity attributes — it only handles the
universal "name + source location + lifecycle" affordances. Per-attribute
editing lives in `EditableField` inside each `*Inspector.svelte`.
-->
<script lang="ts">
	import type { MujocoSimState, SelectedInfo, XmlEntityRecord } from 'mujoco-svelte';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { viewMode } from '$lib/stores/viewMode.svelte.js';
	import { editSession } from '$lib/stores/editSession.svelte.js';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState | null;
		selection: SelectedInfo;
		record: XmlEntityRecord | null;
	};

	let { sim, selection, record }: Props = $props();

	const displayName = $derived(selection.info.name || '(unnamed)');
	const definedAt = $derived(
		record ? `${record.sourceFile}:${record.fullRange.line}` : null
	);

	function openSource(): void {
		if (!record) return;
		editSession.openFile(
			record.sourceFile,
			record.fullRange.line,
			record.fullRange.col
		);
	}
	// Absorbs the "id" row every inspector used to render so the per-kind
	// inspectors can drop it and we don't carry it in two places.
	const entityId = $derived(selection.info.id);

	// Same buffer-or-source pattern as EditableField — `nameBuffer` only holds
	// the user's in-progress text. Outside of editing the input mirrors
	// `record.name` directly via `nameValue`.
	let nameBuffer = $state<string | null>(null);
	const nameValue = $derived(nameBuffer ?? record?.name ?? '');

	function onNameInput(e: Event): void {
		nameBuffer = (e.currentTarget as HTMLInputElement).value;
	}

	async function commitRename(): Promise<void> {
		const draft = nameBuffer;
		nameBuffer = null;
		console.log('[EntityHeader] commitRename', { draft, hasRecord: !!record });
		if (draft === null) {
			console.log('[EntityHeader] rename skipped — no draft');
			return;
		}
		if (!record) {
			console.log('[EntityHeader] rename skipped — no XML record');
			return;
		}
		const trimmed = draft.trim();
		if (!trimmed) {
			console.log('[EntityHeader] rename skipped — empty');
			return;
		}
		if (trimmed === (record.name ?? '')) {
			console.log('[EntityHeader] rename skipped — name unchanged');
			return;
		}
		await editSession.rename(record, trimmed);
	}

	function onRenameKey(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			nameBuffer = null;
			(e.currentTarget as HTMLInputElement).blur();
		}
	}

	async function removeElement(): Promise<void> {
		if (!record) return;
		const ok = confirm(
			`Remove <${record.tagName}${record.name ? ` name="${record.name}"` : ''}> from XML?`
		);
		if (!ok) return;
		await editSession.remove(record);
		// Clear selection — the entity is gone.
		void commands.run('selection.clear');
		void sim;
	}
</script>

<header class="mb-2 flex flex-col gap-1 px-1 pt-1 pb-2">
	<div class="flex items-center gap-2">
		<Badge variant="outline" class="h-4 px-1.5 text-[10px] uppercase">
			{selection.kind}
		</Badge>
		{#if viewMode.isEditing && record}
			<Input
				class="h-5 flex-1 px-1.5 py-0 text-[12px] font-semibold"
				value={nameValue}
				oninput={onNameInput}
				placeholder={record.name ? '' : '(unnamed)'}
				onblur={commitRename}
				onkeydown={onRenameKey}
			/>
			<button
				type="button"
				class="cursor-pointer rounded border-0 bg-transparent p-1 text-muted-foreground hover:text-destructive"
				title="Remove this element from XML"
				aria-label="Remove from XML"
				onclick={removeElement}
			>
				<Trash2Icon class="h-3.5 w-3.5" />
			</button>
		{:else}
			<span class="flex-1 truncate font-semibold">{displayName}</span>
		{/if}
	</div>

	<div class="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
		<span class="opacity-80">#{entityId}</span>
		{#if definedAt}
			<span class="opacity-50">·</span>
			<FileTextIcon class="h-2.5 w-2.5" />
			<button
				type="button"
				class="cursor-pointer border-0 bg-transparent p-0 text-[inherit] [font:inherit] hover:text-primary hover:underline"
				title="Open in editor"
				onclick={openSource}
			>
				{definedAt}
			</button>
		{/if}
		{#if record}
			<span class="opacity-50">·</span>
			<span class="opacity-80">&lt;{record.tagName}&gt;</span>
		{/if}
	</div>
</header>
