<!--
@component
SelectionMarker — camera-facing reticle pinned to the current `sim.selection`'s
world anchor. Purely a *locator* overlay — the per-geom hover/selected edge
outlines live in `GeomHoverOverlay`, so this component does not touch materials
or mesh geometry. Drop inside `<MujocoPhysics>`.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { makeOverlayObject } from '../../utils/overlay.js';
	import {
		readBodyCom,
		readBodyPos,
		readCameraPos,
		readGeomPos,
		readSitePos
	} from '../../utils/modelAccess.js';

	// mjtObj values used by sensor_objtype.
	const mjOBJ_BODY = 1;
	const mjOBJ_JOINT = 3;
	const mjOBJ_GEOM = 5;
	const mjOBJ_SITE = 6;

	type Props = {
		color?: string;
		/** Reticle world size in metres (sprite is billboarded). Default 0.14. */
		reticleSize?: number;
	};

	let { color = '#ffcc00', reticleSize = 0.14 }: Props = $props();

	const sim = useMujocoContext();

	// ---- Resolve the selection to a single anchor position ----
	type Anchor =
		| null
		| { kind: 'body'; id: number }
		| { kind: 'geom'; id: number }
		| { kind: 'site'; id: number }
		| { kind: 'camera'; id: number }
		| { kind: 'joint-of-body'; bodyId: number }
		| { kind: 'light-of-body'; bodyId: number };

	const anchor: Anchor = $derived.by(() => {
		if (sim.status !== 'ready') return null;
		const sel = sim.selection;
		const model = sim.mjModel;
		if (!sel || !model) return null;

		try {
			return resolveAnchor(sel, model);
		} catch {
			return null;
		}
	});

	function resolveAnchor(sel: NonNullable<typeof sim.selection>, model: NonNullable<typeof sim.mjModel>): Anchor {
		switch (sel.kind) {
			case 'body':
				return { kind: 'body', id: sel.id };
			case 'geom':
				return { kind: 'geom', id: sel.id };
			case 'site':
				return { kind: 'site', id: sel.id };
			case 'camera':
				return { kind: 'camera', id: sel.id };
			case 'joint': {
				const j = sim.joints[sel.id];
				return j ? { kind: 'joint-of-body', bodyId: j.bodyId } : null;
			}
			case 'light': {
				const l = sim.lights[sel.id];
				return l && l.bodyId >= 0 ? { kind: 'light-of-body', bodyId: l.bodyId } : null;
			}
			case 'actuator': {
				if (!model.actuator_trnid) return null;
				const jntId = model.actuator_trnid[sel.id * 2];
				if (jntId < 0 || jntId >= model.njnt) return null;
				return { kind: 'joint-of-body', bodyId: model.jnt_bodyid[jntId] };
			}
			case 'sensor': {
				if (!model.sensor_objtype || !model.sensor_objid) return null;
				const objtype = model.sensor_objtype[sel.id];
				const objid = model.sensor_objid[sel.id];
				if (objtype === mjOBJ_BODY) return { kind: 'body', id: objid };
				if (objtype === mjOBJ_SITE) return { kind: 'site', id: objid };
				if (objtype === mjOBJ_GEOM) return { kind: 'geom', id: objid };
				if (objtype === mjOBJ_JOINT)
					return { kind: 'joint-of-body', bodyId: model.jnt_bodyid[objid] };
				return null;
			}
			case 'equality': {
				if (!model.eq_obj1id) return null;
				const a = model.eq_obj1id[sel.id];
				return a >= 0 ? { kind: 'body', id: a } : null;
			}
			default:
				return null;
		}
	}

	// ---- Reticle sprite ----
	let reticleTexture: THREE.CanvasTexture | null = null;
	// `$state.raw` so the Sprite isn't deep-proxied: Three.js mutates its internal
	// matrixWorld / scale / position every render, and a proxy on those would
	// re-trigger this effect → `effect_update_depth_exceeded`.
	let reticle = $state.raw<THREE.Sprite | null>(null);
	let reticleMat: THREE.SpriteMaterial | null = null;

	function makeReticleTexture(hex: string): THREE.CanvasTexture {
		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return new THREE.CanvasTexture(canvas);
		const cx = size / 2;
		const cy = size / 2;

		ctx.shadowColor = hex;
		ctx.shadowBlur = 24;
		ctx.strokeStyle = hex;
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(cx, cy, 70, 0, Math.PI * 2);
		ctx.stroke();

		ctx.shadowBlur = 0;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(cx, cy, 70, 0, Math.PI * 2);
		ctx.stroke();

		ctx.lineWidth = 4;
		ctx.lineCap = 'round';
		const inner = 82;
		const outer = 104;
		for (const a of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
			const dx = Math.cos(a);
			const dy = Math.sin(a);
			ctx.beginPath();
			ctx.moveTo(cx + dx * inner, cy + dy * inner);
			ctx.lineTo(cx + dx * outer, cy + dy * outer);
			ctx.stroke();
		}

		ctx.lineWidth = 2.5;
		const gap = 6;
		const arm = 12;
		ctx.beginPath();
		ctx.moveTo(cx - arm, cy);
		ctx.lineTo(cx - gap, cy);
		ctx.moveTo(cx + gap, cy);
		ctx.lineTo(cx + arm, cy);
		ctx.moveTo(cx, cy - arm);
		ctx.lineTo(cx, cy - gap);
		ctx.moveTo(cx, cy + gap);
		ctx.lineTo(cx, cy + arm);
		ctx.stroke();

		const tex = new THREE.CanvasTexture(canvas);
		tex.needsUpdate = true;
		return tex;
	}

	// Build the sprite on color change. Assign `reticle` exactly once per run so
	// Svelte doesn't see both a read and a write in the same effect (that trips
	// `effect_update_depth_exceeded`).
	$effect(() => {
		reticleTexture?.dispose();
		reticleMat?.dispose();
		reticleTexture = makeReticleTexture(color);
		reticleMat = new THREE.SpriteMaterial({ map: reticleTexture, color: 0xffffff });
		const sprite = makeOverlayObject(new THREE.Sprite(reticleMat), {
			renderOrder: 1000,
			additive: true
		});
		sprite.visible = false;
		sprite.scale.setScalar(reticleSize);
		reticle = sprite;
		return () => {
			reticleTexture?.dispose();
			reticleMat?.dispose();
			reticleTexture = null;
			reticleMat = null;
			reticle = null;
		};
	});

	useTask(
		() => {
			const sprite = reticle;
			if (!sprite) return;
			if (sim.status !== 'ready') {
				sprite.visible = false;
				return;
			}
			const a = anchor;
			const data = sim.mjData;
			const model = sim.mjModel;
			if (!a || !data || !model) {
				sprite.visible = false;
				return;
			}

			let resolved: THREE.Vector3 | null = null;
			try {
				switch (a.kind) {
					case 'body':
						resolved = readBodyCom(data, a.id, sprite.position);
						break;
					case 'geom':
						resolved = readGeomPos(data, a.id, sprite.position);
						break;
					case 'site':
						resolved = readSitePos(data, a.id, sprite.position);
						break;
					case 'camera':
						resolved = readCameraPos(data, a.id, sprite.position);
						break;
					case 'joint-of-body':
					case 'light-of-body':
						resolved = readBodyPos(data, a.bodyId, sprite.position);
						break;
				}
			} catch {
				sprite.visible = false;
				return;
			}
			if (!resolved) {
				sprite.visible = false;
				return;
			}

			const pulse = 1 + 0.08 * Math.sin(sim.time * 4.0);
			sprite.scale.setScalar(reticleSize * pulse);
			sprite.visible = true;
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

{#if reticle}
	<T is={reticle} />
{/if}
