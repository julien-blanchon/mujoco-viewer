<!--
@component
HoverTag

Fixed-position hover label. Reads `sim.hoveredGeomId` reactively and shows
`bodyName / geomName`. Rendered outside `<Canvas>` in the viewport overlay
so it cannot intercept pointer events — the previous Billboard/HTML approach
caused hover flicker and ate click events.
-->
<script lang="ts">
	import { getName, type MujocoSimState } from 'mujoco-svelte';

	type Props = {
		sim: MujocoSimState | null;
	};

	let { sim }: Props = $props();

	const hover = $derived.by(() => {
		const s = sim;
		if (!s) return null;
		const gid = s.hoveredGeomId;
		const model = s.mjModel;
		if (gid === null || gid < 0 || !model) return null;
		const bodyId = model.geom_bodyid?.[gid] ?? -1;
		const bodyName =
			bodyId >= 0 ? getName(model, model.name_bodyadr[bodyId]) || `body#${bodyId}` : '(world)';
		const geomName = getName(model, model.name_geomadr[gid]) || `geom#${gid}`;
		return { bodyName, geomName };
	});
</script>

{#if hover}
	<div
		class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-slate-900/85 px-3 py-1.5 font-mono text-xs text-slate-50 shadow-lg ring-1 ring-black/30 backdrop-blur-sm"
	>
		<span>{hover.bodyName}</span>
		<span class="text-slate-400">/ {hover.geomName}</span>
	</div>
{/if}
