<!--
@component
BoolField — select for `xs:boolean` (true/false) or `autoBoolType`
(true/false/auto). Renders as a dropdown rather than a checkbox because
MuJoCo attributes are often tri-state (mocap="false" vs "true" vs absent) and
a select telegraphs "this is XML state" more clearly.
-->
<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';

	type Props = {
		value: string;
		autoBool?: boolean;
		onCommit: (v: string) => void | Promise<void>;
	};

	let { value, autoBool = false, onCommit }: Props = $props();

	const options = $derived(autoBool ? ['true', 'false', 'auto'] : ['true', 'false']);
	const current = $derived(value || undefined);

	function handleChange(v: string | undefined): void {
		if (v === undefined || v === value) return;
		void onCommit(v);
	}
</script>

<Select.Root type="single" value={current} onValueChange={handleChange}>
	<Select.Trigger size="sm" class="h-5 w-full px-1.5 py-0 text-[11px] font-mono">
		{value || 'auto'}
	</Select.Trigger>
	<Select.Content>
		{#each options as v (v)}
			<Select.Item value={v} class="font-mono text-[11px]">{v}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
