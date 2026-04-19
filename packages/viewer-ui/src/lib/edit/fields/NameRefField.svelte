<!--
@component
NameRefField — dropdown of valid entity names for name-reference attributes
(e.g. `light.target`, `actuator.joint`, `geom.material`). Prevents the user
from typing a name that doesn't resolve at compile time.

Uses the shared shadcn-svelte `Select` so styling matches EnumField /
BoolField (same trigger height, font, focus ring). Empty / "— none —" is
offered so optional references can be cleared. If the current XML value
isn't in the candidate list (scene loaded with a dangling reference), we
show it tagged "(unknown)" so the user can see and replace it.
-->
<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';

	type Props = {
		value: string;
		candidates: readonly string[];
		/** Allow "no value" as a choice. Most ref attrs are optional. */
		allowEmpty?: boolean;
		onCommit: (v: string) => void | Promise<void>;
	};

	let { value, candidates, allowEmpty = true, onCommit }: Props = $props();

	// shadcn Select treats `undefined` as "no selection". Map empty-string
	// values (our "— none —") to a sentinel so the Select can still show
	// them as the active choice.
	const NONE = '__none__';
	const current = $derived(value === '' ? (allowEmpty ? NONE : undefined) : value);
	const isUnknown = $derived(value !== '' && !candidates.includes(value));

	function handleChange(next: string | undefined): void {
		if (next === undefined) return;
		const normalized = next === NONE ? '' : next;
		if (normalized === value) return;
		void onCommit(normalized);
	}
</script>

<Select.Root type="single" value={current} onValueChange={handleChange}>
	<Select.Trigger size="sm" class="h-5 w-full px-1.5 py-0 font-mono text-[11px]">
		{#if value === ''}
			<span class="text-muted-foreground">— none —</span>
		{:else if isUnknown}
			<span>{value} <span class="opacity-60">(unknown)</span></span>
		{:else}
			{value}
		{/if}
	</Select.Trigger>
	<Select.Content>
		{#if allowEmpty}
			<Select.Item value={NONE} class="font-mono text-[11px] text-muted-foreground">
				— none —
			</Select.Item>
		{/if}
		{#if isUnknown}
			<Select.Item {value} class="font-mono text-[11px]">
				{value} <span class="opacity-60">(unknown)</span>
			</Select.Item>
		{/if}
		{#each candidates as name (name)}
			<Select.Item value={name} class="font-mono text-[11px]">{name}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
