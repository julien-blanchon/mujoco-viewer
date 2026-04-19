<!--
@component
ContactMarkers — instanced sphere visualization of MuJoCo contacts.

Reads `data.ncon` first and accesses each contact via `contact.get(i)` with a
cap at `maxContacts` to avoid WASM heap OOM.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { getContact } from '../../types.js';

	type Props = {
		/** Maximum contacts to render. Default: 100. */
		maxContacts?: number;
		/** Sphere radius. Default: 0.008. */
		radius?: number;
		/** Color. Default: '#22d3ee'. */
		color?: string;
		/** Show markers. Default: true. Overridden by VisualOptions.vis.contactPoint when a provider is mounted. */
		visible?: boolean;
	};

	let { maxContacts = 100, radius = 0.008, color = '#22d3ee', visible = true }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const effectiveVisible = $derived(visualOptions ? visualOptions.vis.contactPoint : visible);

	const dummy = new THREE.Object3D();
	let mesh = $state<THREE.InstancedMesh>();

	useTask(
		(_delta) => {
			const m = mesh;
			const data = sim.mjData;
			if (!m) return;
			if (!data || !effectiveVisible) {
				m.count = 0;
				return;
			}

			const ncon = data.ncon;
			const count = Math.min(ncon, maxContacts);
			for (let i = 0; i < count; i++) {
				const c = getContact(data, i);
				if (!c) {
					m.count = i;
					m.instanceMatrix.needsUpdate = true;
					return;
				}
				dummy.position.set(c.pos[0], c.pos[1], c.pos[2]);
				dummy.updateMatrix();
				m.setMatrixAt(i, dummy.matrix);
			}
			m.count = count;
			m.instanceMatrix.needsUpdate = true;
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready'}
	<T.InstancedMesh
		bind:ref={mesh}
		args={[undefined, undefined, maxContacts]}
		frustumCulled={false}
		renderOrder={999}
	>
		<T.SphereGeometry args={[radius, 8, 8]} />
		<!-- `transparent` is set so the material obeys `depthTest: false` reliably
		     in all Three renderers; we don't pulse opacity, just want it on top. -->
		<T.MeshBasicMaterial {color} depthTest={false} transparent={true} />
	</T.InstancedMesh>
{/if}
