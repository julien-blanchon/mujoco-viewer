<!--
@component
VectorField — N parallel number inputs that commit as a single whitespace-
joined XML attribute. Used for `pos="x y z"`, `rgba="r g b a"`, `size="x y z"`,
`range="lo hi"`, etc.

Labels default to positional (x/y/z/w for count≤4, index numbers otherwise).
Callers can override via `labels` — the EditableField passes semantic names
for known attributes (rgba → r/g/b/a, range → lo/hi, ...).

`flexible` = the attr may be provided with fewer values than `count` (the
"upTo" family); we still render `count` slots but tolerate trailing empties,
producing a shorter joined value on commit.

Value model: `slots` is always derived from `value` plus per-slot overrides.
Overrides hold in-progress user input so background reactive updates (sim
reload, model rebuild) don't clobber typing. Overrides clear on blur/commit.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';

	type Props = {
		value: string;
		count: number;
		integer?: boolean;
		flexible?: boolean;
		labels?: readonly string[];
		onCommit: (v: string) => void | Promise<void>;
	};

	let { value, count, integer = false, flexible = false, labels, onCommit }: Props = $props();

	function split(raw: string, n: number): string[] {
		const parts = raw.trim().split(/\s+/).filter((s) => s !== '');
		const out = parts.slice(0, n);
		while (out.length < n) out.push('');
		return out;
	}

	// Source slots reflect `value` directly — always up to date.
	const sourceSlots = $derived(split(value, count));

	// Per-slot user overrides; `null` = "use source". Cleared on commit.
	let overrides = $state<(string | null)[]>([]);

	const displaySlots = $derived(
		Array.from({ length: count }, (_, i) => overrides[i] ?? sourceSlots[i] ?? '')
	);

	const defaultLabels = $derived.by(() => {
		if (labels) return labels;
		if (count === 2) return ['lo', 'hi'];
		if (count === 3) return ['x', 'y', 'z'];
		if (count === 4) return ['x', 'y', 'z', 'w'];
		if (count === 6) return ['x', 'y', 'z', 'x', 'y', 'z'];
		return Array.from({ length: count }, (_, i) => String(i + 1));
	});

	function oninput(i: number) {
		return (e: Event) => {
			const v = (e.currentTarget as HTMLInputElement).value;
			const next = overrides.slice();
			while (next.length < count) next.push(null);
			next[i] = v;
			overrides = next;
		};
	}

	async function commit(): Promise<void> {
		// Comma → dot so locale typists ("0,3") don't poison the XML source.
		const pieces = displaySlots.map((s) => s.trim().replace(/,/g, '.'));
		overrides = []; // clear overrides — source becomes authoritative again

		let joined: string;
		if (flexible) {
			let end = pieces.length;
			while (end > 0 && pieces[end - 1] === '') end--;
			joined = pieces.slice(0, end).join(' ');
		} else {
			joined = pieces.map((p) => (p === '' ? '0' : p)).join(' ');
		}
		if (integer) {
			joined = joined
				.split(/\s+/)
				.map((s) => (s === '' ? '' : String(Math.round(Number(s)))))
				.filter((s) => s !== '')
				.join(' ');
		}
		if (joined === value) return;
		await onCommit(joined);
	}

	function onkeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			overrides = [];
			(e.currentTarget as HTMLInputElement).blur();
		}
	}
</script>

<div class="grid gap-1" style:grid-template-columns="repeat({count}, minmax(0, 1fr))">
	{#each displaySlots as slot, i (i)}
		<div class="flex flex-col gap-0.5">
			<Input
				class="h-5 px-1 py-0 text-center font-mono text-[10.5px]"
				type="text"
				inputmode={integer ? 'numeric' : 'decimal'}
				pattern={integer ? '-?[0-9]*' : '-?[0-9.eE+\\-]*'}
				value={slot}
				oninput={oninput(i)}
				onblur={commit}
				{onkeydown}
			/>
			<span class="text-center text-[8.5px] text-muted-foreground/70">
				{defaultLabels[i] ?? i + 1}
			</span>
		</div>
	{/each}
</div>
