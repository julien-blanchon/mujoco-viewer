<!--
@component
ApplyMenu — top-toolbar edit-commit affordance.

A split button: the primary action applies every valid pending edit to the
underlying text buffers (dirty chip appears on the editor tab; Ctrl+S in
VSCode handles the write to disk). A secondary chevron opens a popover with
the structured edit list + per-row discard + raw diff for users who want to
review before committing.

Any clicks here only mutate the model buffer — persistence is still handled
by the host (VSCode `WorkspaceEdit`, browser download flow, …) so the file
ends up marked "modified" natively.
-->
<script lang="ts">
	import { createPatch } from 'diff';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import TargetIcon from '@lucide/svelte/icons/crosshair';
	import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
	import { editSession, editLabel, shortenMujocoError } from '$lib/stores/editSession.svelte.js';
	import { commands } from '$lib/commands/registry.svelte.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let showRawDiff = $state(false);

	const pending = $derived(editSession.pending);
	const validCount = $derived(editSession.validEditCount);
	const invalidCount = $derived(pending.length - validCount);
	const globalError = $derived(editSession.globalError);
	const errorParts = $derived(globalError ? shortenMujocoError(globalError) : null);
	let showErrorDetail = $state(false);
	let reviewOpen = $state(false);

	// Per-file diff — only build it while the raw-diff section is open; it's
	// O(N edits × scene size) which adds up on big scenes.
	const fileDiffs = $derived.by(() => {
		if (!showRawDiff) return [] as Array<{ file: string; patch: string }>;
		return editSession.modifiedFiles.map((entry) => ({
			file: entry.file,
			patch: createPatch(entry.file, entry.before, entry.after, '', '', { context: 1 })
		}));
	});

	function selectEntity(kind: string, name: string | null, baselineIndex: number): void {
		void commands.run('selection.set', { kind, id: baselineIndex });
		void name;
	}

	function applyEdits(): void {
		if (validCount === 0 || editSession.isApplying) return;
		void editSession.save();
	}
</script>

<div class="inline-flex items-center">
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={invalidCount > 0 ? 'destructive' : 'default'}
					size="sm"
					class="h-7 gap-1.5 rounded-r-none pr-2.5 pl-2.5 text-[11px]"
					disabled={validCount === 0 || editSession.isApplying}
					onclick={applyEdits}
				>
					{#if invalidCount > 0}
						<AlertTriangleIcon class="h-3 w-3" />
					{:else}
						<CheckIcon class="h-3 w-3" />
					{/if}
					Apply
					{#if pending.length > 0}
						<Badge variant="secondary" class="h-4 px-1 text-[9px]">
							{pending.length}
						</Badge>
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			Apply pending edits to the editor buffer — then Ctrl+S to save.
		</Tooltip.Content>
	</Tooltip.Root>

	<Popover.Root bind:open={reviewOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={invalidCount > 0 ? 'destructive' : 'default'}
					size="sm"
					class="h-7 w-6 rounded-l-none border-l border-l-primary-foreground/25 p-0"
					disabled={pending.length === 0}
					aria-label="Review pending edits"
				>
					<ChevronDownIcon class="h-3 w-3" />
				</Button>
			{/snippet}
		</Popover.Trigger>

		<Popover.Content class="w-[420px] p-0" align="end" sideOffset={6}>
			<header class="flex items-center justify-between px-3 py-2">
				<div class="flex items-center gap-2">
					<span class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
						Pending edits
					</span>
					<Badge variant="outline" class="h-4 px-1.5 text-[10px]">{pending.length}</Badge>
					{#if invalidCount > 0}
						<Badge variant="destructive" class="h-4 px-1.5 text-[10px]">
							{invalidCount} invalid
						</Badge>
					{/if}
				</div>
			</header>
			<Separator />

			{#if pending.length === 0}
				<div class="px-3 py-4 text-center text-[11px] text-muted-foreground">
					No pending edits.
				</div>
			{:else}
				<ul class="m-0 max-h-[40vh] list-none overflow-y-auto p-0">
					{#each pending as edit (edit.id)}
						<li
							class="flex items-start gap-2 px-3 py-1.5 text-[11px] hover:bg-muted/40
								{edit.status === 'invalid' ? 'border-l-2 border-l-destructive bg-destructive/5' : ''}"
						>
							<button
								type="button"
								class="mt-0.5 cursor-pointer rounded border-0 bg-transparent p-0.5 text-muted-foreground hover:text-primary"
								title="Select in viewport"
								aria-label="Select in viewport"
								onclick={() =>
									selectEntity(edit.target.kind, edit.target.name, edit.target.baselineIndex)}
							>
								<TargetIcon class="h-3 w-3" />
							</button>

							<div class="min-w-0 flex-1">
								<div class="font-mono text-[10.5px] leading-tight break-words text-foreground">
									{editLabel(edit)}
								</div>
								{#if edit.status === 'invalid' && edit.error}
									<div class="mt-0.5 text-[10px] break-words text-destructive">
										⚠ {edit.error}
									</div>
								{/if}
							</div>

							<button
								type="button"
								class="mt-0.5 cursor-pointer rounded border-0 bg-transparent p-0.5 text-muted-foreground hover:text-destructive"
								title="Discard this edit"
								aria-label="Discard this edit"
								onclick={() => editSession.discardEdit(edit.id)}
							>
								<TrashIcon class="h-3 w-3" />
							</button>
						</li>
					{/each}
				</ul>

				{#if errorParts}
					<Separator />
					<div
						class="flex flex-col gap-1 bg-destructive/10 px-3 py-2 text-[10.5px] text-destructive"
					>
						<div class="flex items-start gap-1.5">
							<AlertTriangleIcon class="mt-0.5 h-3 w-3 shrink-0" />
							<div class="flex-1">
								<strong>Compile error:</strong>
								{errorParts.short}
							</div>
						</div>
						{#if errorParts.detail !== errorParts.short}
							<button
								type="button"
								class="cursor-pointer self-start border-0 bg-transparent p-0 text-[10px] underline opacity-70 hover:opacity-100"
								onclick={() => (showErrorDetail = !showErrorDetail)}
							>
								{showErrorDetail ? 'Hide details' : 'Show details'}
							</button>
							{#if showErrorDetail}
								<pre
									class="m-0 max-h-40 overflow-auto font-mono text-[10px] break-words whitespace-pre-wrap opacity-80"
								>{errorParts.detail}</pre>
							{/if}
						{/if}
					</div>
				{/if}

				<Separator />

				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent px-3 py-1.5 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-muted/30"
					onclick={() => (showRawDiff = !showRawDiff)}
				>
					{#if showRawDiff}
						<ChevronDownIcon class="h-3 w-3" />
					{:else}
						<ChevronRightIcon class="h-3 w-3" />
					{/if}
					Raw diff
				</button>
				{#if showRawDiff}
					{#if fileDiffs.length === 0}
						<pre
							class="m-0 max-h-[30vh] overflow-auto bg-muted/30 px-3 py-2 font-mono text-[10px] leading-tight text-foreground">(no changes)</pre>
					{:else}
						<div class="max-h-[30vh] overflow-auto bg-muted/30">
							{#each fileDiffs as d (d.file)}
								<div class="border-b border-border/50 last:border-0">
									<div
										class="bg-muted/60 px-3 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>
										{d.file}
									</div>
									<pre
										class="m-0 px-3 py-2 font-mono text-[10px] leading-tight text-foreground">{d.patch}</pre>
								</div>
							{/each}
						</div>
					{/if}
				{/if}

				<Separator />
				<footer class="flex items-center justify-between gap-2 px-3 py-2">
					<Button
						variant="ghost"
						size="sm"
						class="h-6 text-[10.5px]"
						onclick={() => editSession.discardAll()}
					>
						Discard all
					</Button>
					<Button
						variant="default"
						size="sm"
						class="h-6 gap-1 text-[10.5px]"
						disabled={validCount === 0 || editSession.isApplying}
						onclick={() => {
							applyEdits();
							reviewOpen = false;
						}}
					>
						<CheckIcon class="h-3 w-3" />
						Apply ({validCount})
					</Button>
				</footer>
			{/if}
		</Popover.Content>
	</Popover.Root>
</div>
