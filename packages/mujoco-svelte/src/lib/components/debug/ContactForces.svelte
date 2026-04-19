<!--
@component
ContactForces — arrow per active contact, length proportional to normal force.

Requires `VisualOptions.vis.contactForce` to be on (or no provider). Scale is
`VisualOptions.scale.contactForce` (world units per Newton). The arrow points
along the contact normal; normals are taken from the contact `frame` (first
three entries are the world-frame normal).

Force magnitude uses MuJoCo's `mj_contactForce` via the WASM module.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { getContact } from '../../types.js';
	import { makeOverlayObject } from '../../utils/overlay.js';

	type Props = {
		/** Maximum arrows to render. Default: 64. */
		max?: number;
		/** Arrow color. Default: '#facc15'. */
		color?: string;
	};

	let { max = 64, color = '#facc15' }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.contactForce ?? true);

	let root = $state<THREE.Group>();
	let arrows: THREE.ArrowHelper[] = [];

	$effect(() => {
		void sim.status;
		const g = root;
		if (!g || sim.status !== 'ready') return;

		for (const a of arrows) g.remove(a);
		arrows = [];
		const c = new THREE.Color(color);
		for (let i = 0; i < max; i++) {
			const a = makeOverlayObject(
				new THREE.ArrowHelper(
					new THREE.Vector3(0, 0, 1),
					new THREE.Vector3(),
					0.01,
					c,
					0.03,
					0.015
				),
				{ renderOrder: 999, transparent: false }
			);
			a.visible = false;
			g.add(a);
			arrows.push(a);
		}

		return () => {
			for (const a of arrows) g.remove(a);
			arrows = [];
		};
	});

	const _n = new THREE.Vector3();
	const _force = new Float64Array(6); // linear (3) + torque (3)

	function readContactForce(dataIdx: number): number {
		// mj_contactForce fills the result buffer with [fx, fy, fz, tx, ty, tz] in
		// the contact frame. We just need magnitude → |(fx, fy, fz)|.
		try {
			const mujoco = sim.mujoco;
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return 0;
			(mujoco as unknown as {
				mj_contactForce?: (m: unknown, d: unknown, id: number, result: Float64Array) => void;
			}).mj_contactForce?.(model, data, dataIdx, _force);
			const fx = _force[0];
			const fy = _force[1];
			const fz = _force[2];
			return Math.hypot(fx, fy, fz);
		} catch {
			return 0;
		}
	}

	useTask(
		() => {
			if (!visible) {
				for (const a of arrows) a.visible = false;
				return;
			}
			const data = sim.mjData;
			if (!data) return;
			const scale = visualOptions?.scale.contactForce ?? 0.1;
			const ncon = Math.min(data.ncon, arrows.length);
			for (let i = 0; i < arrows.length; i++) {
				const a = arrows[i];
				if (i >= ncon) {
					a.visible = false;
					continue;
				}
				const c = getContact(data, i);
				if (!c) {
					a.visible = false;
					continue;
				}
				a.visible = true;
				a.position.set(c.pos[0], c.pos[1], c.pos[2]);
				// Contact frame: first row is the normal.
				if (c.frame && c.frame.length >= 3) {
					_n.set(c.frame[0], c.frame[1], c.frame[2]).normalize();
					a.setDirection(_n);
				}
				const mag = readContactForce(i);
				const length = Math.max(0.005, mag * scale);
				a.setLength(length, Math.min(length * 0.3, 0.03), Math.min(length * 0.12, 0.015));
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
