<!--
@component
FrameAxes — XYZ axes overlay, driven by `VisualOptions.frame`.

Supported modes (mirroring MuJoCo's `mjFRAME_*`):
  - `'body'`  — one axes gizmo per body (skips world)
  - `'geom'`  — one per geom
  - `'site'`  — one per site
  - `'world'` — single gizmo at the world origin
  - `'com'`   — one per body at its COM (xipos)
  - `'contact'` — one per active contact
  - `'none'`  — hidden (component unmounts)

Scale comes from `VisualOptions.scale.frame`.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions, type FrameMode } from '../../core/state/VisualOptions.svelte.js';
	import { getContact } from '../../types.js';
	import { makeOverlayObject } from '../../utils/overlay.js';

	type Props = {
		/** Override frame mode. Falls back to VisualOptions.frame, then 'none'. */
		mode?: FrameMode;
		/** Override axis length. Falls back to VisualOptions.scale.frame, then 0.1. */
		scale?: number;
	};

	let { mode, scale }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();

	const effectiveMode: FrameMode = $derived(mode ?? visualOptions?.frame ?? 'none');
	const effectiveScale = $derived(scale ?? visualOptions?.scale.frame ?? 0.1);

	let root = $state<THREE.Group>();
	let helpers: THREE.AxesHelper[] = [];

	function rebuild() {
		const g = root;
		const model = sim.mjModel;
		if (!g || !model || sim.status !== 'ready') return;

		for (const h of helpers) g.remove(h);
		helpers = [];
		if (effectiveMode === 'none') return;

		const count = countFor(effectiveMode);
		for (let i = 0; i < count; i++) {
			const axes = makeOverlayObject(new THREE.AxesHelper(effectiveScale), {
				renderOrder: 998,
				transparent: false
			});
			axes.userData.idx = i;
			g.add(axes);
			helpers.push(axes);
		}
	}

	function countFor(m: FrameMode): number {
		const model = sim.mjModel;
		if (!model) return 0;
		switch (m) {
			case 'body':
				return Math.max(0, model.nbody - 1);
			case 'geom':
				return model.ngeom;
			case 'site':
				return model.nsite;
			case 'world':
				return 1;
			case 'com':
				return Math.max(0, model.nbody - 1);
			case 'contact':
				// Max capacity — actual count varies per frame.
				return 64;
			default:
				return 0;
		}
	}

	// Rebuild when mode/scale changes.
	$effect(() => {
		void sim.status;
		void effectiveMode;
		void effectiveScale;
		rebuild();
		return () => {
			const g = root;
			if (!g) return;
			for (const h of helpers) g.remove(h);
			helpers = [];
		};
	});

	const _q = new THREE.Quaternion();

	useTask(
		() => {
			const model = sim.mjModel;
			const data = sim.mjData;
			if (!model || !data) return;
			const m = effectiveMode;

			if (m === 'world') {
				const h = helpers[0];
				if (h) h.position.set(0, 0, 0), h.quaternion.identity();
				return;
			}

			if (m === 'body' || m === 'com') {
				for (let i = 0; i < helpers.length; i++) {
					const bid = i + 1; // skip world
					const h = helpers[i];
					const src = m === 'com' && data.xipos ? data.xipos : data.xpos;
					h.position.set(src[bid * 3], src[bid * 3 + 1], src[bid * 3 + 2]);
					h.quaternion.set(
						data.xquat[bid * 4 + 1],
						data.xquat[bid * 4 + 2],
						data.xquat[bid * 4 + 3],
						data.xquat[bid * 4]
					);
				}
				return;
			}

			if (m === 'geom') {
				for (let i = 0; i < helpers.length && i < model.ngeom; i++) {
					const h = helpers[i];
					if (data.geom_xpos) {
						h.position.set(
							data.geom_xpos[i * 3],
							data.geom_xpos[i * 3 + 1],
							data.geom_xpos[i * 3 + 2]
						);
					}
					if (data.geom_xmat) {
						const off = i * 9;
						const mat = new THREE.Matrix4().set(
							data.geom_xmat[off], data.geom_xmat[off + 1], data.geom_xmat[off + 2], 0,
							data.geom_xmat[off + 3], data.geom_xmat[off + 4], data.geom_xmat[off + 5], 0,
							data.geom_xmat[off + 6], data.geom_xmat[off + 7], data.geom_xmat[off + 8], 0,
							0, 0, 0, 1
						);
						h.quaternion.setFromRotationMatrix(mat);
					}
				}
				return;
			}

			if (m === 'site') {
				for (let i = 0; i < helpers.length && i < model.nsite; i++) {
					const h = helpers[i];
					h.position.set(
						data.site_xpos[i * 3],
						data.site_xpos[i * 3 + 1],
						data.site_xpos[i * 3 + 2]
					);
					if (data.site_xmat) {
						const off = i * 9;
						const mat = new THREE.Matrix4().set(
							data.site_xmat[off], data.site_xmat[off + 1], data.site_xmat[off + 2], 0,
							data.site_xmat[off + 3], data.site_xmat[off + 4], data.site_xmat[off + 5], 0,
							data.site_xmat[off + 6], data.site_xmat[off + 7], data.site_xmat[off + 8], 0,
							0, 0, 0, 1
						);
						h.quaternion.setFromRotationMatrix(mat);
					}
				}
				return;
			}

			if (m === 'contact') {
				const ncon = Math.min(data.ncon, helpers.length);
				for (let i = 0; i < helpers.length; i++) {
					const h = helpers[i];
					if (i >= ncon) {
						h.visible = false;
						continue;
					}
					const c = getContact(data, i);
					if (!c) {
						h.visible = false;
						continue;
					}
					h.visible = true;
					h.position.set(c.pos[0], c.pos[1], c.pos[2]);
					if (c.frame && c.frame.length >= 9) {
						const mat = new THREE.Matrix4().set(
							c.frame[0], c.frame[1], c.frame[2], 0,
							c.frame[3], c.frame[4], c.frame[5], 0,
							c.frame[6], c.frame[7], c.frame[8], 0,
							0, 0, 0, 1
						);
						h.quaternion.setFromRotationMatrix(mat);
					} else {
						h.quaternion.identity();
					}
				}
				return;
			}

			// Silence TS about unused _q; it's here for future quaternion-chain reuse.
			void _q;
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if sim.status === 'ready' && effectiveMode !== 'none'}
	<T.Group bind:ref={root} />
{/if}
