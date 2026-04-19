<!--
@component
DefaultFloor — a large neutral ground plane at z=0, rendered only when the
user has `visualOptions.render.defaultFloor` on. Colour tracks the host
theme via `ThemeColors` so it reads as a slightly darker / lighter tint of
the editor background.
-->
<script lang="ts">
	import { T } from '@threlte/core';
	import { useVisualOptions } from 'mujoco-svelte';
	import { onDestroy } from 'svelte';
	import { ThemeColors } from './themeColors.svelte.js';

	const options = useVisualOptions();

	const theme = new ThemeColors();
	onDestroy(() => theme.dispose());
</script>

{#if options && options.render.defaultFloor}
	<!-- Nudged slightly below z=0 so we lose any z-fighting with MJCF floor
	     geoms that sit right at the origin. `-1` is below any reasonable
	     depth-buffer precision at typical sim-camera distances, so the MJCF
	     floor wins cleanly when one exists. -->
	<T.Mesh rotation={[0, 0, 0]} position={[0, 0, -1]} receiveShadow>
		<T.PlaneGeometry args={[100, 100]} />
		<T.MeshStandardMaterial color={theme.floor} roughness={0.95} metalness={0} />
	</T.Mesh>
{/if}
