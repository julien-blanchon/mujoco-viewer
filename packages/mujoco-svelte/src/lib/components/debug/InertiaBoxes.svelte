<!--
@component
InertiaBoxes — ellipsoid wireframe per body sized to its inertia diagonal.

The ellipsoid encloses a uniform-density body whose principal moments match
MuJoCo's `body_inertia[3*i]`. For a box of size (a, b, c) and mass m, the
inertia components are `I_x = (m / 3)(b^2 + c^2)`, etc. We solve this for the
three axis half-extents so the wireframe roughly matches the physical mass
distribution.

Mass-0 / world body is skipped. Honors `VisualOptions.vis.inertia`.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { iterBodies } from '../../utils/modelIter.js';

	type Props = {
		/** Wireframe color. */
		color?: string;
	};

	let { color = '#a78bfa' }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const visible = $derived(visualOptions?.vis.inertia ?? false);

	let root = $state<THREE.Group>();
	let meshes: THREE.LineSegments[] = [];

	function solveHalfExtents(ix: number, iy: number, iz: number, mass: number):
		| [number, number, number]
		| null {
		// Solve: I_x = (m/3) (b^2 + c^2), etc.
		// Let A=b^2+c^2, B=a^2+c^2, C=a^2+b^2. So a^2 = (B+C-A)/2, etc.
		const k = (3 / mass);
		const A = ix * k;
		const B = iy * k;
		const C = iz * k;
		const a2 = (B + C - A) / 2;
		const b2 = (A + C - B) / 2;
		const c2 = (A + B - C) / 2;
		if (a2 < 0 || b2 < 0 || c2 < 0 || !Number.isFinite(a2 + b2 + c2)) return null;
		return [Math.sqrt(a2), Math.sqrt(b2), Math.sqrt(c2)];
	}

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

		const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
		for (const bid of iterBodies(model)) {
			const mass = model.body_mass[bid];
			if (!mass || mass <= 0) {
				meshes.push(null as unknown as THREE.LineSegments);
				continue;
			}
			const ix = model.body_inertia[3 * bid];
			const iy = model.body_inertia[3 * bid + 1];
			const iz = model.body_inertia[3 * bid + 2];
			const halfs = solveHalfExtents(ix, iy, iz, mass);
			if (!halfs) {
				meshes.push(null as unknown as THREE.LineSegments);
				continue;
			}
			const [hx, hy, hz] = halfs;
			const sphere = new THREE.SphereGeometry(1, 16, 12);
			const scaled = sphere.clone().scale(hx, hy, hz);
			sphere.dispose();
			const wire = new THREE.WireframeGeometry(scaled);
			scaled.dispose();
			const line = new THREE.LineSegments(wire, mat);
			line.userData.bodyId = bid;
			line.frustumCulled = false;
			g.add(line);
			meshes.push(line);
		}

		return () => {
			for (const m of meshes) {
				if (!m) continue;
				g.remove(m);
				m.geometry.dispose();
			}
			mat.dispose();
			meshes = [];
		};
	});

	useTask(
		() => {
			const data = sim.mjData;
			if (!data) return;
			for (const m of meshes) {
				if (!m) continue;
				const bid = m.userData.bodyId as number;
				const src = data.xipos ?? data.xpos;
				m.position.set(src[bid * 3], src[bid * 3 + 1], src[bid * 3 + 2]);
				m.quaternion.set(
					data.xquat[bid * 4 + 1],
					data.xquat[bid * 4 + 2],
					data.xquat[bid * 4 + 3],
					data.xquat[bid * 4]
				);
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} {visible} />
{/if}
