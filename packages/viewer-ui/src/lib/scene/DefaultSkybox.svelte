<!--
@component
DefaultSkybox — a subtle, theme-derived gradient backdrop.

Rendered as a fullscreen quad pinned to the far plane (z=0.999 in clip
space, `depthTest: false`, `renderOrder: -999`) so it sits behind every
mesh, the MJCF skybox, and the debug overlays without touching
`scene.background`.

Colours come from `ThemeColors`, which reads the host UI's editor
background (VSCode's `--vscode-editor-background` or the debug app's
`--background` token) and offsets it in HSL so the sky stays visually
related to the theme without colliding with panel surfaces.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T } from '@threlte/core';
	import { useVisualOptions } from 'mujoco-svelte';
	import { onDestroy } from 'svelte';
	import { ThemeColors } from './themeColors.svelte.js';

	const options = useVisualOptions();

	const theme = new ThemeColors();
	onDestroy(() => theme.dispose());

	// Stable THREE.Color instances — mutating .r/.g/.b each theme change keeps
	// the uniform identity stable so Three.js doesn't recompile the shader.
	const topColor = new THREE.Color();
	const bottomColor = new THREE.Color();
	const uniforms = {
		top: { value: topColor },
		bottom: { value: bottomColor }
	};

	$effect(() => {
		topColor.set(theme.skyTop);
		bottomColor.set(theme.skyBottom);
	});

	const vertexShader = /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			// Project the unit quad onto the far clip plane; no view /
			// projection transform needed.
			gl_Position = vec4(position.xy, 0.999, 1.0);
		}
	`;
	const fragmentShader = /* glsl */ `
		uniform vec3 top;
		uniform vec3 bottom;
		varying vec2 vUv;
		void main() {
			float t = smoothstep(0.0, 1.0, vUv.y);
			gl_FragColor = vec4(mix(bottom, top, t), 1.0);
		}
	`;
</script>

{#if options?.render.defaultSkybox}
	<T.Mesh renderOrder={-999} frustumCulled={false}>
		<T.PlaneGeometry args={[2, 2]} />
		<T.ShaderMaterial
			args={[
				{
					uniforms,
					vertexShader,
					fragmentShader,
					depthTest: false,
					depthWrite: false
				}
			]}
		/>
	</T.Mesh>
{/if}
