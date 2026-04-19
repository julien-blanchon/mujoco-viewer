<!--
@component
ModeToggle — Read | Edit segmented control in the top toolbar.

Semantically a radio group (exactly one mode is always active), so we use
`RadioGroup` as the primitive instead of `ToggleGroup`. `ToggleGroup
type="single"` permits the user to deselect the active item and end up with
no mode selected, which makes no sense for a view-mode switch.
-->
<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { RadioGroup } from 'bits-ui';
	import { viewMode, type ViewMode } from '$lib/stores/viewMode.svelte.js';
	import { cn } from '$lib/utils.js';

	function onValueChange(v: string): void {
		if (v === 'read' || v === 'edit') viewMode.set(v as ViewMode);
	}

	// Segmented-button styling. Active item pops to `--primary` so the mode
	// is unmistakable under flat VSCode themes; inactive items stay flat
	// inside a shared outlined container.
	const itemBase =
		'relative inline-flex h-7 flex-1 items-center justify-center gap-1 px-2 text-[11px] font-medium transition-colors ' +
		'hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
		'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:shadow-sm';
</script>

<RadioGroup.Root
	value={viewMode.current}
	{onValueChange}
	class={cn(
		'inline-flex h-7 items-stretch overflow-hidden rounded-md border border-border bg-background'
	)}
	orientation="horizontal"
	loop
>
	<RadioGroup.Item
		value="read"
		class={cn(itemBase, 'border-r border-border')}
		aria-label="Read mode"
	>
		<EyeIcon class="size-3" />
		Read
	</RadioGroup.Item>
	<RadioGroup.Item value="edit" class={itemBase} aria-label="Edit mode">
		<PencilIcon class="size-3" />
		Edit
	</RadioGroup.Item>
</RadioGroup.Root>
