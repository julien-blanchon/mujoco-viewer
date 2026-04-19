<!--
@component
AttrEditList — auto-rendered editable list of every schema-known attribute
on the current record, grouped by category (Transform / Shape / Appearance /
Physics / Limits / Behavior / Defaults / Misc).

Each row uses `<EditableField>` with a fallback pulled from
`liveValueFor(sim, record, attr)` so numeric / vector fields pre-fill with
the post-compile value when the XML doesn't set the attribute explicitly.

**Mutex groups** (orientation, inertia) are consolidated into a single row
with a representation picker: only the active member's editor is shown, and
switching representation auto-clears the old member through the edit
session's mutex logic. This fixes the "changing euler makes axisangle
visually revert" confusion — there's no longer a second orientation field
to revert.

Custom per-kind inspectors (BodyInspector, JointInspector, ...) handle
things this component can't express structurally: relations (body →
children, joint → body), live qpos/qvel readouts with needle bars, material
swatches, etc. They continue to render above this list in the Inspector.
-->
<script lang="ts">
	import type { MujocoSimState, XmlEntityRecord } from 'mujoco-svelte';
	import { elementSchemaFor } from '$lib/schema/index.js';
	import {
		attrCtxOf,
		groupAttrs,
		isAttrVisible,
		mutexGroupOf,
		type AttrGroup,
		type MutexGroupMeta
	} from '$lib/schema/uiMeta.js';
	import { liveValueFor } from '$lib/schema/liveValue.js';
	import { editSession } from '$lib/stores/editSession.svelte.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import EditableField from './EditableField.svelte';

	type Props = {
		sim: MujocoSimState | null;
		record: XmlEntityRecord | null;
	};

	let { sim, record }: Props = $props();

	const elementSchema = $derived(record ? elementSchemaFor(record.tagName) : null);

	const grouped = $derived.by(() => {
		if (!record || !elementSchema) return [];
		const list = Array.from(elementSchema.attrs.entries()).map(([attr, attrSchema]) => ({
			attr,
			data: attrSchema
		}));
		return groupAttrs(list);
	});

	// Evaluate the live fallback for every visible attribute so each
	// `<EditableField>` receives a pre-filled value when the XML attr is
	// missing. Recomputed reactively — uses `sim.time` so the display stays
	// in sync with physics steps for dynamic values like `pos`.
	const fallbacks = $derived.by(() => {
		const out: Record<string, string | null> = {};
		if (!sim || !record) return out;
		void sim.time;
		for (const group of grouped) {
			for (const entry of group.entries) {
				out[entry.attr] = liveValueFor(sim, record, entry.attr);
			}
		}
		return out;
	});

	/**
	 * Partition each render group's entries into:
	 *   - regular rows (not part of any mutex group)
	 *   - mutex rows (one per mutex group present in this render group)
	 *
	 * The "active member" of a mutex group is the first member currently set
	 * on the record; if none is set we show the group's first member as the
	 * default slot (users can switch via the picker).
	 */
	const renderGroups = $derived.by(() => {
		type RegularRow = {
			kind: 'regular';
			attr: string;
			meta: (typeof grouped)[number]['entries'][number]['meta'];
			data: (typeof grouped)[number]['entries'][number]['data'];
		};
		type MutexRow = {
			kind: 'mutex';
			mutex: MutexGroupMeta;
			activeAttr: string;
			// Schema entry for the active member (label / help / default come from here).
			meta: (typeof grouped)[number]['entries'][number]['meta'];
			data: (typeof grouped)[number]['entries'][number]['data'];
		};
		type Row = RegularRow | MutexRow;
		const out: Array<{ group: AttrGroup; rows: Row[] }> = [];
		if (!record) return out;

		// Flatten the current record's attrs once — visibility rules like
		// "show geom.mesh only when geom.type=mesh" need to consult other
		// attrs on the same element, and re-iterating the attrs Map for every
		// rule call adds up on the larger schemas.
		const ctx = attrCtxOf(record.attrs);

		for (const group of grouped) {
			const mutexCollected = new Map<
				string,
				{
					mutex: MutexGroupMeta;
					// schema entries keyed by attr name so we can pull meta/data for the active member
					entries: Map<string, (typeof group)['entries'][number]>;
				}
			>();
			const regulars: RegularRow[] = [];

			for (const entry of group.entries) {
				// Skip type-gated attrs that aren't meaningful for the current
				// type / mode. Keeps the inspector focused on attrs the user
				// can actually set without MuJoCo silently ignoring them.
				if (!isAttrVisible(record.tagName, entry.attr, ctx)) continue;
				const mutex = mutexGroupOf(entry.attr);
				if (mutex) {
					let bucket = mutexCollected.get(mutex.key);
					if (!bucket) {
						bucket = { mutex, entries: new Map() };
						mutexCollected.set(mutex.key, bucket);
					}
					bucket.entries.set(entry.attr, entry);
				} else {
					regulars.push({ kind: 'regular', attr: entry.attr, meta: entry.meta, data: entry.data });
				}
			}

			// Assemble a stable row list: regulars first (already alphabetically
			// sorted by groupAttrs), then mutex rows in MUTEX_GROUPS definition
			// order filtered to those actually present in this render group.
			const rows: Row[] = [...regulars];
			for (const { mutex, entries } of mutexCollected.values()) {
				// Pick the active member: first in preferred order that's set on
				// the record, else the group's preferred default (first member).
				let activeAttr = mutex.members.find((m) => record!.attrs.has(m)) ?? mutex.members[0];
				// If the preferred default isn't actually in the schema for this
				// element, fall back to any member that IS in the schema.
				if (!entries.has(activeAttr)) {
					activeAttr = [...entries.keys()][0];
				}
				const activeEntry = entries.get(activeAttr);
				if (!activeEntry) continue; // shouldn't happen
				rows.push({
					kind: 'mutex',
					mutex,
					activeAttr,
					meta: activeEntry.meta,
					data: activeEntry.data
				});
			}

			if (rows.length > 0) out.push({ group: group.group, rows });
		}

		return out;
	});

	function groupClass(g: AttrGroup): string {
		// Small color accent on the group header — keeps the long list navigable.
		const map: Partial<Record<AttrGroup, string>> = {
			Transform: 'text-sky-500',
			Shape: 'text-emerald-500',
			Appearance: 'text-fuchsia-500',
			Physics: 'text-amber-500',
			Limits: 'text-orange-500',
			Behavior: 'text-indigo-500',
			Defaults: 'text-muted-foreground'
		};
		return map[g] ?? 'text-muted-foreground';
	}

	// Switch the active member of a mutex group. Fires a setAttr for the new
	// member seeded with its live runtime value (or the group's default) —
	// the edit session's mutex handling clears whatever member was active.
	async function switchMutexMember(
		mutex: MutexGroupMeta,
		newAttr: string
	): Promise<void> {
		if (!record) return;
		const seed = fallbacks[newAttr] ?? mutex.defaults[newAttr] ?? '';
		await editSession.setAttr(record, newAttr, seed);
	}
</script>

{#if record && elementSchema && renderGroups.length > 0}
	<div class="flex flex-col gap-2">
		{#each renderGroups as group (group.group)}
			<section>
				<h4
					class="mb-1 text-[9.5px] font-semibold tracking-wider uppercase {groupClass(group.group)}"
				>
					{group.group}
				</h4>
				<dl class="grid grid-cols-[130px_1fr] items-center gap-x-2 gap-y-1 font-mono text-[11px]">
					{#each group.rows as row (row.kind === 'mutex' ? `mutex:${row.mutex.key}` : row.attr)}
						{#if row.kind === 'regular'}
							{@const rowAttr = record.attrs.get(row.attr)}
							<dt class="text-muted-foreground">
								<Tooltip.Root>
									<Tooltip.Trigger
										onclick={() => {
											if (rowAttr)
												editSession.openFile(
													record.sourceFile,
													rowAttr.nameRange.line,
													rowAttr.nameRange.col
												);
										}}
										class="group/attr-label inline-flex max-w-full items-center gap-1 text-left leading-tight underline decoration-dotted decoration-transparent underline-offset-2 {rowAttr
											? 'cursor-pointer hover:text-foreground hover:decoration-muted-foreground'
											: 'cursor-help hover:decoration-muted-foreground/60'}"
									>
										<span class="truncate">{row.meta.label ?? row.attr}</span>
										{#if rowAttr}
											<ExternalLinkIcon
												class="size-2.5 shrink-0 opacity-40 transition-opacity group-hover/attr-label:opacity-100"
											/>
										{/if}
									</Tooltip.Trigger>
									<Tooltip.Content
										side="left"
										class="flex max-w-xs flex-col items-start gap-1 px-3 py-2"
									>
										<span class="font-mono text-xs font-semibold">{row.attr}</span>
										{#if row.data.default}
											<span class="font-mono text-[10.5px] opacity-70">
												default <span class="opacity-100">{row.data.default}</span>
											</span>
										{/if}
										{#if row.data.required}
											<span class="text-[10.5px] font-semibold uppercase tracking-wider">
												Required
											</span>
										{/if}
										{#if row.meta.help}
											<span class="text-[11px] opacity-90">{row.meta.help}</span>
										{/if}
										{#if rowAttr}
											<span class="text-[10px] opacity-70">
												Click to jump to {record.sourceFile}:{rowAttr.nameRange.line}
											</span>
										{/if}
									</Tooltip.Content>
								</Tooltip.Root>
							</dt>
							<dd class="m-0 break-all text-foreground">
								<EditableField
									{sim}
									{record}
									attr={row.attr}
									display={fallbacks[row.attr] ?? row.data.default ?? ''}
									fallback={fallbacks[row.attr]}
								/>
							</dd>
						{:else}
							{@const mutexAttr = record.attrs.get(row.activeAttr)}
							<!-- Mutex row: label column matches regular rows; dd stacks a
							     shadcn Select (to switch representation) on top of the
							     value editor. Switching auto-clears the previous
							     representation via the editSession's mutex handling. -->
							<dt class="text-muted-foreground">
								<Tooltip.Root>
									<Tooltip.Trigger
										onclick={() => {
											if (mutexAttr)
												editSession.openFile(
													record.sourceFile,
													mutexAttr.nameRange.line,
													mutexAttr.nameRange.col
												);
										}}
										class="group/attr-label inline-flex max-w-full items-center gap-1 text-left leading-tight underline decoration-dotted decoration-transparent underline-offset-2 {mutexAttr
											? 'cursor-pointer hover:text-foreground hover:decoration-muted-foreground'
											: 'cursor-help hover:decoration-muted-foreground/60'}"
									>
										<span class="truncate">{row.mutex.label}</span>
										{#if mutexAttr}
											<ExternalLinkIcon
												class="size-2.5 shrink-0 opacity-40 transition-opacity group-hover/attr-label:opacity-100"
											/>
										{/if}
									</Tooltip.Trigger>
									<Tooltip.Content
										side="left"
										class="flex max-w-xs flex-col items-start gap-1 px-3 py-2"
									>
										<span class="font-mono text-xs font-semibold">{row.mutex.label}</span>
										<span class="text-[11px] opacity-90">
											One of: {row.mutex.members.join(', ')}. Switching replaces the
											previous representation — MuJoCo allows only one at a time.
										</span>
										{#if row.meta.help}
											<span class="text-[11px] opacity-80">{row.meta.help}</span>
										{/if}
									</Tooltip.Content>
								</Tooltip.Root>
							</dt>
							<dd class="m-0 flex flex-col gap-1 break-all text-foreground">
								<Select.Root
									type="single"
									value={row.activeAttr}
									onValueChange={(v) => {
										if (v && v !== row.activeAttr) void switchMutexMember(row.mutex, v);
									}}
								>
									<Select.Trigger size="sm" class="h-5 w-full px-1.5 py-0 font-mono text-[10.5px]">
										{row.activeAttr}
									</Select.Trigger>
									<Select.Content>
										{#each row.mutex.members as m (m)}
											<Select.Item value={m} class="font-mono text-[11px]">{m}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<EditableField
									{sim}
									{record}
									attr={row.activeAttr}
									display={fallbacks[row.activeAttr] ?? row.data.default ?? ''}
									fallback={fallbacks[row.activeAttr]}
								/>
							</dd>
						{/if}
					{/each}
				</dl>
			</section>
		{/each}
	</div>
{:else if record}
	<div
		class="rounded border border-dashed border-border bg-muted/30 px-2 py-1.5 text-[10.5px] text-muted-foreground"
	>
		No schema entry for &lt;{record.tagName}&gt;.
	</div>
{/if}
