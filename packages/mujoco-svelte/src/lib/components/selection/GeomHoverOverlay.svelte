<!--
@component
GeomHoverOverlay — additive visual feedback on hovered *and* selected geoms.

The set of geoms that get the overlay is `hovered ∪ selected` — deduped, so
hovering the already-selected geom doesn't double-render. One shared visual
is used for both states (no special "selected" color): the earlier amber
treatment bled across geoms sharing a material (emissive) and painted whole
bodies on tree clicks, which looked loud.

Stacks three effects per target:

  1. **Edges** (LineSegments from EdgesGeometry) — crisp outline of sharp
     feature lines. Silent on smooth surfaces by design.
  2. **Inverted-hull shell** (BackSide mesh, slightly inflated) — classic
     toon silhouette that works on everything, including spheres where the
     edges pass produces nothing.
  3. **Animated glow halo** (additive-blended larger shell) — soft aura
     that pulses in scale + opacity via `useTask`. Phase-staggered per
     geom so multi-geom highlights don't sync into one blob. Base inflate
     is kept generous so the halo remains visible at the bottom of its
     pulse cycle, even on tiny meshes.

All overlay objects are configured via `makeOverlayObject`, which applies
depthTest/raycast/cull settings uniformly.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { useTask, useThrelte } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { makeOverlayObject, PulseAnimator, phaseFromId } from '../../utils/overlay.js';
	import { iterBodies, iterBodyGeoms, isBodyDescendant } from '../../utils/modelIter.js';

	type Props = {
		hoverColor?: string;
		hoverOpacity?: number;
		/** EdgesGeometry thresholdAngle; higher = fewer (coarser) edges. */
		thresholdAngle?: number;
	};

	let { hoverColor = '#60a5fa', hoverOpacity = 0.95, thresholdAngle = 25 }: Props = $props();

	const sim = useMujocoContext();
	const { scene } = useThrelte();

	function findGeomMeshes(geomId: number): THREE.Mesh[] {
		const out: THREE.Mesh[] = [];
		scene.traverse((obj) => {
			if (obj.userData?.geomID === geomId && (obj as THREE.Mesh).isMesh) {
				out.push(obj as THREE.Mesh);
			}
		});
		return out;
	}

	const hoveredGeomIds = $derived.by<number[]>(() => {
		const gid = sim.hoveredGeomId;
		return gid !== null && gid >= 0 ? [gid] : [];
	});

	const selectedGeomIds = $derived.by<number[]>(() => {
		// Skip while the sim isn't ready — during a failed-reload window the
		// old `mjModel` handle can already be freed, and `iterBodies` reading
		// `model.nbody` throws `BindingError: … on deleted object`.
		if (sim.status !== 'ready') return [];
		const sel = sim.selection;
		const model = sim.mjModel;
		if (!sel || !model) return [];
		try {
			if (sel.kind === 'geom') return sel.id >= 0 ? [sel.id] : [];
			if (sel.kind === 'body') {
				// Picking a torso should light up the arms + hands hanging off of it.
				const out: number[] = [];
				for (const bid of iterBodies(model, { includeWorld: true })) {
					if (!isBodyDescendant(model, bid, sel.id)) continue;
					for (const gid of iterBodyGeoms(model, bid)) out.push(gid);
				}
				return out;
			}
			return [];
		} catch {
			return [];
		}
	});

	// Union of hovered + selected. Deduped so a hover over the already-selected
	// geom doesn't stack two copies of the overlay on top of each other.
	const activeGeomIds = $derived.by<number[]>(() => {
		const ids = new Set<number>();
		for (const id of hoveredGeomIds) ids.add(id);
		for (const id of selectedGeomIds) ids.add(id);
		return [...ids];
	});

	// Halo pulse is shared across all active geoms — tighter amplitude than the
	// selection pulse because the halo is already a large overlay. Base 1.14
	// inflate + ±2% swing keeps the minimum clearly readable on tiny meshes.
	type PulseHandle = {
		obj: THREE.Object3D;
		mat: THREE.Material & { opacity: number };
		animator: PulseAnimator;
	};
	let pulses: PulseHandle[] = [];

	useTask(() => {
		if (pulses.length === 0) return;
		const t = performance.now() * 0.001;
		for (const p of pulses) p.animator.apply(p.obj, p.mat, t);
	});

	type AttachHandle = { parent: THREE.Mesh; obj: THREE.Object3D; pulse?: PulseHandle };

	function attachHover(ids: number[]): AttachHandle[] {
		const attached: AttachHandle[] = [];
		const color = new THREE.Color(hoverColor);

		for (const gid of ids) {
			for (const parent of findGeomMeshes(gid)) {
				if (!parent.geometry) continue;

				// Feature-edge outline — does the heavy lifting for boxes / capsules.
				const edgeGeom = new THREE.EdgesGeometry(parent.geometry, thresholdAngle);
				const edgeMat = new THREE.LineBasicMaterial({
					color,
					opacity: hoverOpacity
				});
				const lines = makeOverlayObject(new THREE.LineSegments(edgeGeom, edgeMat), {
					renderOrder: 999
				});
				lines.scale.setScalar(1.005);
				parent.add(lines);
				attached.push({ parent, obj: lines });

				// Inverted-hull shell — small constant silhouette so smooth meshes
				// still read as outlined when the pulse halo is at its minimum.
				const shellMat = new THREE.MeshBasicMaterial({ color });
				const shell = makeOverlayObject(new THREE.Mesh(parent.geometry, shellMat), {
					renderOrder: 998,
					backSide: true,
					opacity: 0.35
				});
				// A generous static inflate keeps the shell legible on small geoms
				// (foot, finger) that otherwise wouldn't have enough outline pixels.
				shell.scale.setScalar(1.05);
				parent.add(shell);
				attached.push({ parent, obj: shell });

				// Animated glow halo — additive, phase-staggered per geom.
				const haloMat = new THREE.MeshBasicMaterial({ color });
				const halo = makeOverlayObject(new THREE.Mesh(parent.geometry, haloMat), {
					renderOrder: 997,
					backSide: true,
					additive: true,
					opacity: 0.35
				});
				halo.scale.setScalar(1.14);
				parent.add(halo);
				const pulse: PulseHandle = {
					obj: halo,
					mat: haloMat,
					animator: new PulseAnimator({
						baseScale: 1.14,
						baseOpacity: 0.35,
						scaleAmp: 0.02,
						opacityAmp: 0.5,
						speed: 3.0,
						phase: phaseFromId(gid)
					})
				};
				pulses.push(pulse);
				attached.push({ parent, obj: halo, pulse });
			}
		}
		return attached;
	}

	function detach(attached: AttachHandle[]): void {
		const disposedGeoms = new Set<THREE.BufferGeometry>();
		for (const h of attached) {
			h.parent.remove(h.obj);
			const mesh = h.obj as THREE.Mesh | THREE.LineSegments;
			const isShared = mesh.geometry === h.parent.geometry;
			if (!isShared && mesh.geometry && !disposedGeoms.has(mesh.geometry)) {
				mesh.geometry.dispose();
				disposedGeoms.add(mesh.geometry);
			}
			const mat = mesh.material as THREE.Material | undefined;
			if (mat) mat.dispose();
			if (h.pulse) {
				const i = pulses.indexOf(h.pulse);
				if (i >= 0) pulses.splice(i, 1);
			}
		}
	}

	$effect(() => {
		const attached = attachHover(activeGeomIds);
		return () => detach(attached);
	});
</script>
