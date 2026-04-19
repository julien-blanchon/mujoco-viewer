<script lang="ts" generics="TValue extends string = string">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import PaneRow from './pane-row.svelte';

	type Option = { label: string; value: TValue };

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		value?: TValue;
		/** Accepts either `Record<label, value>` (tweakpane-style) or an explicit `{label, value}[]`. */
		options: Record<string, TValue> | Option[];
		placeholder?: string;
		disabled?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		label,
		value = $bindable(),
		options,
		placeholder,
		disabled,
		...restProps
	}: Props = $props();

	const normalized = $derived<Option[]>(
		Array.isArray(options)
			? options
			: Object.entries(options).map(([k, v]) => ({ label: k, value: v as TValue }))
	);

	const selectedLabel = $derived(
		normalized.find((o) => o.value === value)?.label ?? placeholder ?? ''
	);
</script>

<PaneRow bind:ref {label} class={className} {...restProps}>
	<div data-slot="pane-select-control" class="flex min-w-0 items-center">
		<Select.Root type="single" bind:value {disabled}>
			<Select.Trigger
				size="sm"
				class="h-6 w-full min-w-0 px-2 py-0 text-[11px]"
				aria-label={label}
			>
				<span class="truncate">{selectedLabel}</span>
			</Select.Trigger>
			<Select.Content>
				{#each normalized as opt (opt.value)}
					<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
</PaneRow>
