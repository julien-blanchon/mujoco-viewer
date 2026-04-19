<!--
@component
EnumField — dropdown for xs:enumeration-typed attributes (e.g. `type` on
`<geom>`, `mode` on `<camera>`, `integrator` on `<option>`).
-->
<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';

	type Props = {
		value: string;
		values: readonly string[];
		placeholder?: string;
		onCommit: (v: string) => void | Promise<void>;
	};

	let { value, values, placeholder = 'auto', onCommit }: Props = $props();

	const current = $derived(value || undefined);

	function handleChange(v: string | undefined): void {
		if (v === undefined) return;
		if (v === value) return;
		void onCommit(v);
	}
</script>

<Select.Root type="single" value={current} onValueChange={handleChange}>
	<Select.Trigger size="sm" class="h-5 w-full px-1.5 py-0 text-[11px] font-mono">
		{value || placeholder}
	</Select.Trigger>
	<Select.Content>
		{#each values as v (v)}
			<Select.Item value={v} class="font-mono text-[11px]">{v}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
