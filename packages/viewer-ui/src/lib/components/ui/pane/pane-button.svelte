<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Button, type ButtonVariant } from '$lib/components/ui/button/index.js';
	import PaneRow from './pane-row.svelte';

	type Props = {
		title: string;
		/** Optional label on the left; if omitted the button spans the full row. */
		label?: string;
		variant?: ButtonVariant;
		class?: string;
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		ref?: HTMLButtonElement | null;
	};

	let {
		ref = $bindable(null),
		class: className,
		title,
		label,
		variant = 'secondary',
		onclick,
		disabled
	}: Props = $props();
</script>

<PaneRow {label} class="h-auto py-0.5">
	<Button
		bind:ref
		{variant}
		size="xs"
		{onclick}
		{disabled}
		class={cn('h-6 w-full text-[11px]', className)}
	>
		{title}
	</Button>
</PaneRow>
