<!--
@component
NumberField — single-number input.

We tried `type="number" lang="en"` first but Safari and Chrome-on-macOS
unconditionally follow the OS locale for display, regardless of the HTML
`lang` attribute. The only way to guarantee dot-decimal display in every
browser is to use `type="text"` with `inputmode="decimal"` (keeps the
mobile numeric keyboard) and a pattern hint. The spinner arrows aren't
useful for scientific-range values anyway, so the tradeoff is cheap.

As a belt-and-braces for users with French-keyboard muscle memory, we
still normalise any `,` → `.` on commit.

Locale-behaviour references:
  https://www.ctrl.blog/entry/html5-input-number-localization.html
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';

	type Props = {
		value: string;
		integer?: boolean;
		placeholder?: string;
		onCommit: (v: string) => void | Promise<void>;
	};

	let { value, integer = false, placeholder = 'auto', onCommit }: Props = $props();

	let buffer = $state<string | null>(null);
	const shown = $derived(buffer ?? value);
	const pattern = $derived(integer ? '-?[0-9]*' : '-?[0-9.eE+\\-]*');

	function oninput(e: Event): void {
		buffer = (e.currentTarget as HTMLInputElement).value;
	}

	function normalizeDecimal(s: string): string {
		return s.replace(/,/g, '.');
	}

	async function commit(): Promise<void> {
		const draft = buffer;
		buffer = null;
		if (draft === null) return;
		let final = normalizeDecimal(draft.trim());
		if (final === value) return;
		if (integer && final !== '' && /^-?\d+(\.\d+)?$/.test(final)) {
			final = String(Math.round(Number(final)));
		}
		await onCommit(final);
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
	type="text"
	inputmode={integer ? 'numeric' : 'decimal'}
	{pattern}
	value={shown}
	{placeholder}
	{oninput}
	onblur={commit}
	{onkeydown}
/>
