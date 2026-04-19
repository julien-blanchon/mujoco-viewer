<!--
@component
RenderEffects — scene-wide render toggles driven by VisualOptions.

Handles the flags that don't map to a standalone overlay component:
  - `render.wireframe` → flip every material's `wireframe` flag
  - `render.fog`       → scene.fog = Fog(color, near, far), else null
  - `render.haze`      → simpler fog at larger distance (exponential feel)
  - `render.shadow`    → renderer.shadowMap.enabled
  - `vis.transparent`  → multiply every material's opacity by `transparentAlpha`
  - `groups.geom`      → per-geom visibility by its mjcf group index (0..5)

Walks the scene tree each time a flag flips (rare enough that we pay the
traversal cost without worrying). State is restored on component teardown.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { useThrelte } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';

	const visualOptions = useVisualOptions();
	const sim = useMujocoContext();
	const { scene, renderer } = useThrelte();

	// Remember each material's original wireframe + opacity so we can restore
	// them when the toggle flips off.
	type MaterialSnapshot = {
		wireframe: boolean;
		opacity: number;
		transparent: boolean;
	};
	const snapshots = new WeakMap<THREE.Material, MaterialSnapshot>();

	function snapshot(mat: THREE.Material): MaterialSnapshot {
		const existing = snapshots.get(mat);
		if (existing) return existing;
		const shot: MaterialSnapshot = {
			wireframe: (mat as THREE.MeshStandardMaterial).wireframe ?? false,
			opacity: (mat as { opacity?: number }).opacity ?? 1,
			transparent: (mat as { transparent?: boolean }).transparent ?? false
		};
		snapshots.set(mat, shot);
		return shot;
	}

	function forEachMaterial(fn: (mat: THREE.Material) => void) {
		scene.traverse((obj) => {
			const maybeMesh = obj as THREE.Mesh;
			const mat = maybeMesh.material;
			if (!mat) return;
			if (Array.isArray(mat)) for (const m of mat) fn(m);
			else fn(mat);
		});
	}

	// Wireframe — applied to every material in the scene.
	$effect(() => {
		if (!visualOptions) return;
		const on = visualOptions.render.wireframe;
		forEachMaterial((mat) => {
			const shot = snapshot(mat);
			(mat as THREE.MeshStandardMaterial).wireframe = on ? true : shot.wireframe;
			mat.needsUpdate = true;
		});
	});

	// Transparency — multiplies opacity by the user-controlled alpha.
	$effect(() => {
		if (!visualOptions) return;
		const on = visualOptions.vis.transparent;
		const alpha = visualOptions.transparentAlpha;
		forEachMaterial((mat) => {
			const shot = snapshot(mat);
			const typed = mat as { opacity?: number; transparent?: boolean };
			if (on) {
				typed.opacity = shot.opacity * alpha;
				typed.transparent = true;
			} else {
				typed.opacity = shot.opacity;
				typed.transparent = shot.transparent;
			}
			mat.needsUpdate = true;
		});
	});

	// Shadow map — global renderer toggle.
	let previousShadowEnabled = false;
	let shadowCaptured = false;
	$effect(() => {
		if (!visualOptions || !renderer) return;
		if (!shadowCaptured) {
			previousShadowEnabled = renderer.shadowMap.enabled;
			shadowCaptured = true;
		}
		renderer.shadowMap.enabled = visualOptions.render.shadow;
		renderer.shadowMap.needsUpdate = true;
	});

	// Group visibility — MuJoCo gives every geom/site a group index (0..5).
	// Flip a checkbox, toggle every matching mesh's `visible`.
	$effect(() => {
		if (!visualOptions) return;
		const model = sim.mjModel;
		if (!model) return;
		const groupFlags = visualOptions.groups.geom;
		// Tracking the array content requires reading each slot.
		for (let i = 0; i < 6; i++) void groupFlags[i];
		scene.traverse((obj) => {
			const geomId = obj.userData?.geomID as number | undefined;
			if (geomId === undefined) return;
			const g = model.geom_group[geomId];
			if (g < 0 || g >= 6) return;
			obj.visible = groupFlags[g];
		});
	});

	// Fog / haze — apply to scene.fog. Haze = longer-distance version of fog.
	let previousFog: THREE.Scene['fog'] = null;
	let fogCaptured = false;

	$effect(() => {
		if (!visualOptions) return;
		const fog = visualOptions.render.fog;
		const haze = visualOptions.render.haze;
		if (!fogCaptured) {
			previousFog = scene.fog;
			fogCaptured = true;
		}
		if (fog) {
			scene.fog = new THREE.Fog(0x94a3b8, 2, 30);
		} else if (haze) {
			scene.fog = new THREE.FogExp2(0xcbd5e1, 0.03);
		} else {
			scene.fog = previousFog;
		}
	});

	// Teardown — restore everything.
	$effect(() => {
		return () => {
			forEachMaterial((mat) => {
				const shot = snapshots.get(mat);
				if (!shot) return;
				const typed = mat as THREE.MeshStandardMaterial & { opacity: number; transparent: boolean };
				typed.wireframe = shot.wireframe;
				typed.opacity = shot.opacity;
				typed.transparent = shot.transparent;
				mat.needsUpdate = true;
			});
			if (fogCaptured) scene.fog = previousFog;
			if (shadowCaptured && renderer) renderer.shadowMap.enabled = previousShadowEnabled;
		};
	});
</script>
