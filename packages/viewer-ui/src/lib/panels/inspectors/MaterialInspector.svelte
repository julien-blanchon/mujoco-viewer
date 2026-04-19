<!--
@component
MaterialInspector — color swatch + texture navigation.

All numeric/enum attributes (rgba, emission, specular, shininess,
reflectance, texrepeat, texuniform, ...) are rendered by the generic
`AttrEditList` that `Inspector.svelte` attaches below. This component is
only the "custom widget" layer: the big color swatch and the
navigate-to-texture link.
-->
<script lang="ts">
	import type { MaterialInfo, MujocoSimState } from 'mujoco-svelte';
	import { commands } from '$lib/commands/registry.svelte.js';

	type Props = {
		sim: MujocoSimState;
		info: MaterialInfo;
	};

	// `sim` not read here — MaterialInfo already has the rgba; runtime data
	// isn't needed. Kept in the prop type for consistency with other
	// inspectors.
	let { info }: Props = $props();

	const swatch = $derived(
		`rgba(${Math.round(info.rgba[0] * 255)}, ${Math.round(info.rgba[1] * 255)}, ${Math.round(
			info.rgba[2] * 255
		)}, ${info.rgba[3].toFixed(2)})`
	);
</script>

<div class="flex flex-col gap-2">
	<div class="h-12 rounded border border-border" style:background={swatch}></div>
	{#if info.texId >= 0}
		<div class="font-mono text-[11px]">
			<span class="text-muted-foreground">texture →</span>
			<button
				type="button"
				class="cursor-pointer border-0 bg-transparent p-0 text-primary [font:inherit] hover:underline"
				onclick={() => void commands.run('selection.set', { kind: 'texture', id: info.texId })}
			>
				#{info.texId}
			</button>
		</div>
	{/if}
</div>
