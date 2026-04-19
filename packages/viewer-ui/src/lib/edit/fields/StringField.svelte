<!--
@component
StringField — free-form text input. Supports an optional regex pattern hint
(from `xs:restriction`/`xs:pattern`). Invalid input is still committed — we
let MuJoCo's compiler be the final judge; the pattern is informational only.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';

	type Props = {
		value: string;
		placeholder?: string;
		pattern?: string;
		onCommit: (v: string) => void | Promise<void>;
	};

	let { value, placeholder = 'auto', pattern, onCommit }: Props = $props();

	let buffer = $state<string | null>(null);
	const shown = $derived(buffer ?? value);

	function oninput(e: Event): void {
		buffer = (e.currentTarget as HTMLInputElement).value;
	}

	async function commit(): Promise<void> {
		const draft = buffer;
		buffer = null;
		if (draft === null || draft === value) return;
		await onCommit(draft);
	}

	function onkeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			buffer = null;
			(e.currentTarget as HTMLInputElement).blur();
		}
	}
</script>

<Input
	class="h-5 px-1.5 py-0 font-mono text-[11px]"
	value={shown}
	{placeholder}
	{pattern}
	{oninput}
	onblur={commit}
	{onkeydown}
/>
