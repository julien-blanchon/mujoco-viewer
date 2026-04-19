<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import PaneRow from './pane-row.svelte';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		value?: boolean;
		disabled?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		label,
		value = $bindable(false),
		disabled,
		...restProps
	}: Props = $props();
</script>

<PaneRow bind:ref {label} class={className} {...restProps}>
	<div data-slot="pane-checkbox-control" class="flex items-center">
		<Checkbox bind:checked={value} {disabled} aria-label={label} />
	</div>
</PaneRow>
