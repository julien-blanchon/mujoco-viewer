<!--
@component
EditableField — schema-aware attribute editor. In read mode it shows
`display` (the live formatted value from `mjModel`). In edit mode it picks
the right input by looking up the attribute in the parsed `mujoco.xsd`
schema:

  enum         → `<EnumField>` (dropdown)
  bool/autoBool→ `<BoolField>`  (true/false[/auto] dropdown)
  int/float    → `<NumberField>`
  reals/ints   → `<VectorField>` (N side-by-side inputs with axis labels)
  string       → `<StringField>` (free-form)
  unknown tag  → `<StringField>` fallback

The component never touches `mjModel` directly — it just shows `display` in
read mode and routes writes through `editSession.setAttr` on commit. Labels
(x/y/z, r/g/b/a) are tuned per attribute via a small override table for the
cases where the generic label-by-count rule would pick a less-readable
default.
-->
<script lang="ts">
	import type { MujocoSimState, XmlEntityRecord } from 'mujoco-svelte';
	import { viewMode } from '$lib/stores/viewMode.svelte.js';
	import { editSession } from '$lib/stores/editSession.svelte.js';
	import { attrSchemaFor } from '$lib/schema/index.js';
	import { attrCtxOf, dynamicShapeFor, nameRefFor } from '$lib/schema/uiMeta.js';
	import { candidateNames } from '$lib/schema/nameRefCandidates.js';
	import BoolField from './fields/BoolField.svelte';
	import EnumField from './fields/EnumField.svelte';
	import NameRefField from './fields/NameRefField.svelte';
	import NumberField from './fields/NumberField.svelte';
	import StringField from './fields/StringField.svelte';
	import VectorField from './fields/VectorField.svelte';

	type Props = {
		sim: MujocoSimState | null;
		record: XmlEntityRecord | null;
		attr: string;
		/** Pretty display string for read mode (e.g. "0.123, 0.456, 0.789"). */
		display: string;
		/**
		 * Fallback in edit mode when the XML attribute isn't present in source.
		 * Should be an XML-formatted string (whitespace-joined for vectors) —
		 * typically pulled from `liveValueFor(sim, record, attr)` so the user
		 * sees the post-compile value even when it's inherited from a
		 * `<default>` or auto-computed. Committing any value writes an explicit
		 * XML attribute (overriding the inherit).
		 */
		fallback?: string | null;
	};

	let { sim, record, attr, display, fallback = null }: Props = $props();

	const xmlAttr = $derived(record?.attrs.get(attr));
	/** What the widgets show and bind to. */
	const editValue = $derived(xmlAttr?.value ?? fallback ?? '');
	const schema = $derived(record ? attrSchemaFor(record.tagName, attr) : null);
	/** Name-ref metadata (null if this attr isn't a reference). */
	const nameRef = $derived(record ? nameRefFor(record.tagName, attr) : null);
	const refCandidates = $derived(nameRef ? candidateNames(sim, nameRef.kinds) : []);
	/** Dynamic shape override — e.g. geom.size shrinks to 1 slot when
	 *  geom.type=sphere, grows to 3 when geom.type=box. Null → use schema. */
	const dynamicShape = $derived.by(() => {
		if (!record) return null;
		return dynamicShapeFor(record.tagName, attr, attrCtxOf(record.attrs));
	});

	// Attribute-specific label overrides. Default labels (x/y/z/w) are applied
	// by VectorField; this table covers the cases where the attribute name
	// itself implies a better label set (rgba, range, solref, ...).
	const LABEL_OVERRIDES: Record<string, readonly string[]> = {
		rgba: ['r', 'g', 'b', 'a'],
		range: ['lo', 'hi'],
		ctrlrange: ['lo', 'hi'],
		forcerange: ['lo', 'hi'],
		actrange: ['lo', 'hi'],
		actuatorfrcrange: ['lo', 'hi'],
		gainprm: ['k', 'b', 'g'],
		biasprm: ['b0', 'b1', 'b2'],
		friction: ['slide', 'torsion', 'roll'],
		fromto: ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'],
		xyaxes: ['xx', 'xy', 'xz', 'yx', 'yy', 'yz'],
		solref: ['time', 'damp'],
		solimp: ['d0', 'd1', 'w', 'pow', 'mid']
	};

	async function commit(value: string): Promise<void> {
		if (!record) return;
		// Compare against the raw XML value (not editValue / fallback) — committing
		// a value equal to the XML source is a no-op; committing a value that
		// matches the fallback *does* write to XML (explicit override).
		if (value === (xmlAttr?.value ?? '')) return;
		await editSession.setAttr(record, attr, value);
	}

	// Pick a variant count for types like solimp where the attribute accepts
	// several valid arities. Match the shortest variant that covers the current
	// value; fall back to the smallest variant.
	function detectVariantCount(raw: string, variants: readonly number[]): number {
		const tokens = raw.trim().split(/\s+/).filter((t) => t !== '');
		const n = tokens.length;
		const match = variants.find((v) => v >= n);
		return match ?? variants[variants.length - 1] ?? 1;
	}
</script>

{#if viewMode.isEditing && record}
	{#if nameRef}
		<!-- Name-reference attr: dropdown populated from the current sim so the
		     user can't type a name that doesn't resolve. Takes precedence over
		     the schema-driven dispatch because the XSD classifies these as
		     plain strings. -->
		<NameRefField value={editValue} candidates={refCandidates} onCommit={commit} />
	{:else if schema}
		{#if schema.type.kind === 'enum'}
			<EnumField value={editValue} values={schema.type.values} onCommit={commit} />
		{:else if schema.type.kind === 'bool'}
			<BoolField value={editValue} onCommit={commit} />
		{:else if schema.type.kind === 'autoBool'}
			<BoolField value={editValue} autoBool onCommit={commit} />
		{:else if schema.type.kind === 'int'}
			<NumberField value={editValue} integer onCommit={commit} />
		{:else if schema.type.kind === 'float'}
			<NumberField value={editValue} onCommit={commit} />
		{:else if schema.type.kind === 'ints'}
			<VectorField
				value={editValue}
				count={schema.type.count || 3}
				integer
				flexible={schema.type.flexible}
				labels={LABEL_OVERRIDES[attr]}
				onCommit={commit}
			/>
		{:else if schema.type.kind === 'reals'}
			<VectorField
				value={editValue}
				count={dynamicShape?.count ?? schema.type.count ?? 3}
				flexible={dynamicShape?.flexible ?? schema.type.flexible}
				labels={LABEL_OVERRIDES[attr]}
				onCommit={commit}
			/>
		{:else if schema.type.kind === 'realsVariants'}
			<VectorField
				value={editValue}
				count={detectVariantCount(editValue, schema.type.variants)}
				flexible
				labels={LABEL_OVERRIDES[attr]}
				onCommit={commit}
			/>
		{:else if schema.type.kind === 'string'}
			<StringField value={editValue} pattern={schema.type.pattern} onCommit={commit} />
		{/if}
	{:else}
		<StringField value={editValue} onCommit={commit} />
	{/if}
{:else}
	<span class="break-all text-foreground">{display}</span>
{/if}
