<!--
@component
InspectorLink — click-target that jumps the current selection to another
entity. Canonicalises the inline `<button onclick={() => sim.selection =
{kind, id}}>` pattern that most inspectors reach for when they link between
related entities.

Label defaults to `#<id> <name> →`; callers can provide a custom snippet to
override. `onSelect` dispatches through the command registry so any future
undo / telemetry wrapping gets it for free.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { EntityKind } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		kind: EntityKind;
		id: number;
		name?: string;
		/** When true, render as a non-interactive span (e.g. id === -1). */
		disabled?: boolean;
		/** Override the default label with a custom snippet. */
		label?: Snippet;
	};

	let { kind, id, name, disabled = false, label }: Props = $props();

	function select() {
		if (disabled || id < 0) return;
		void commands.run('selection.set', { kind, id });
	}
</script>

{#if disabled || id < 0}
	<span class="text-muted-foreground">—</span>
{:else}
	<button
		type="button"
		class="cursor-pointer border-0 bg-transparent p-0 text-left text-primary [font:inherit] hover:underline"
		onclick={select}
	>
		{#if label}
			{@render label()}
		{:else}
			#{id}{name ? ` ${name}` : ''} →
		{/if}
	</button>
{/if}
