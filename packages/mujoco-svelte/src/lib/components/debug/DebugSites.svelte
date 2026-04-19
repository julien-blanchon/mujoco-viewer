<!--
@component
DebugSites — renders a magenta octahedron + sprite label at every MuJoCo site.

Useful for identifying named sites (TCP, attachment points, sensor anchors).
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { getName } from '../../core/SceneLoader.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { makeOverlayObject } from '../../utils/overlay.js';
	import { iterSites } from '../../utils/modelIter.js';
	import { readSitePos, maxBodyGeomSize } from '../../utils/modelAccess.js';

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	/** Any site-group visible? — mirrors MuJoCo's `mjvOption.sitegroup` mask. */
	const visible = $derived(
		!visualOptions || visualOptions.groups.site.some((on) => on)
	);

	let root = $state<THREE.Group>();
	let meshes: THREE.Mesh[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const m of meshes) {
			g.remove(m);
			m.geometry.dispose();
		}
		meshes = [];

		const siteSize = (model as Record<string, unknown>).site_size as Float64Array | undefined;
		for (const sid of iterSites(model)) {
			let radius = 0.008;
			if (siteSize) {
				radius = Math.max(siteSize[3 * sid] * 0.5, 0.004);
			} else {
				const maxGeomSize = maxBodyGeomSize(model, model.site_bodyid[sid]);
				if (maxGeomSize > 0) radius = maxGeomSize * 0.15;
			}

			const geometry = new THREE.OctahedronGeometry(radius);
			const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
			const mesh = makeOverlayObject(new THREE.Mesh(geometry, mat), {
				renderOrder: 999,
				transparent: false
			});
			mesh.userData.siteId = sid;

			const canvas = document.createElement('canvas');
			canvas.width = 256;
			canvas.height = 64;
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = '#ff00ff';
			ctx.font = 'bold 36px monospace';
			ctx.textAlign = 'center';
			ctx.fillText(getName(model, model.name_siteadr[sid]), 128, 42);
			const tex = new THREE.CanvasTexture(canvas);
			const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
			const sprite = new THREE.Sprite(spriteMat);
			const labelScale = radius * 15;
			sprite.scale.set(labelScale, labelScale * 0.25, 1);
			sprite.position.y = radius * 2;
			sprite.renderOrder = 999;
			mesh.add(sprite);
			g.add(mesh);
			meshes.push(mesh);
		}

		return () => {
			for (const m of meshes) {
				g.remove(m);
				m.geometry.dispose();
			}
			meshes = [];
		};
	});

	useTask(
		() => {
			const data = sim.mjData;
			if (!data) return;
			for (const mesh of meshes) {
				readSitePos(data, mesh.userData.siteId as number, mesh.position);
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
