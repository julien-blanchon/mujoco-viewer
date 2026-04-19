<!--
@component
PerturbArrows — arrow per body showing externally applied force (xfrc_applied).

Reads `data.xfrc_applied[6*i .. 6*i+2]` (linear force) per body and renders an
arrow from the body origin in the force direction. Length scales with
`VisualOptions.scale.perturbForce`. Bodies with zero applied force are hidden.

Hookup for Phase 4's drag-to-perturb: writes to `xfrc_applied` show up here
automatically.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { makeOverlayObject } from '../../utils/overlay.js';
	import { iterBodies } from '../../utils/modelIter.js';

	type Props = {
		/** Arrow color. */
		color?: string;
	};

	let { color = '#f87171' }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.perturbForce ?? true);

	let root = $state<THREE.Group>();
	let arrows: THREE.ArrowHelper[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const a of arrows) g.remove(a);
		arrows = [];
		const c = new THREE.Color(color);
		// Include worldbody — the iteration needs bid=0 slot so the index-to-body
		// mapping stays straightforward; the task loop skips it with `bid === 0`.
		for (const bid of iterBodies(model, { includeWorld: true })) {
			const a = makeOverlayObject(
				new THREE.ArrowHelper(
					new THREE.Vector3(0, 0, 1),
					new THREE.Vector3(),
					0.001,
					c,
					0.04,
					0.02
				),
				{ renderOrder: 999, transparent: false }
			);
			a.visible = false;
			a.userData.bodyId = bid;
			g.add(a);
			arrows.push(a);
		}

		return () => {
			for (const a of arrows) g.remove(a);
			arrows = [];
		};
	});

	const _dir = new THREE.Vector3();

	useTask(
		() => {
			// Skip during reload windows — `mjModel`/`mjData` can be freed
			// emscripten handles until the new 'ready' event settles.
			if (sim.status !== 'ready') return;
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return;
			let xfrc: Float64Array | null = null;
			try {
				xfrc = data.xfrc_applied;
			} catch {
				return;
			}
			if (!xfrc) return;
			const scale = visualOptions?.scale.perturbForce ?? 0.1;
			try {
				for (const a of arrows) {
					const bid = a.userData.bodyId as number;
					if (bid === 0) {
						a.visible = false;
						continue;
					}
					const off = bid * 6;
					const fx = xfrc[off];
					const fy = xfrc[off + 1];
					const fz = xfrc[off + 2];
					const mag = Math.hypot(fx, fy, fz);
					if (mag < 1e-6) {
						a.visible = false;
						continue;
					}
					a.visible = true;
					a.position.set(data.xpos[bid * 3], data.xpos[bid * 3 + 1], data.xpos[bid * 3 + 2]);
					_dir.set(fx / mag, fy / mag, fz / mag);
					a.setDirection(_dir);
					const length = Math.max(0.01, mag * scale);
					a.setLength(length, Math.min(length * 0.25, 0.05), Math.min(length * 0.12, 0.025));
				}
			} catch {
				/* freed mid-frame — next 'ready' restores */
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
