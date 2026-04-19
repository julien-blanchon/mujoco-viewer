<!--
@component
SelectionRepresentation — kind-specific highlighted marker for the current
`sim.selection`, always rendered regardless of `VisualOptions` toggles.

For body/geom selections, `GeomHoverOverlay` already handles the visual
feedback. This component covers the *other* entity kinds that live in the
scene tree:

  - joint     → bright ArrowHelper at the joint anchor (body-local pos + axis,
                transformed by the parent body's world quat)
  - light     → bright arrow (directional) / cone (spot) / sphere (point)
                at `light_pos`, oriented along `light_dir`
  - camera    → bright frustum (CameraHelper) at `cam_xpos` / `cam_xmat`
  - tendon    → thick bright tube rebuilt each frame from `wrap_xpos`
  - site      → bright octahedron at `site_xpos`
  - actuator  → resolve to its transmission target joint and highlight that

Every marker pulses in scale + opacity via a shared `PulseAnimator` so the
selection reads immediately, and is configured via `makeOverlayObject` so it
renders above scene content regardless of the per-kind debug toggle state.
-->
<script lang="ts">
	import * as THREE from 'three';
	import { T, useTask } from '@threlte/core';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { makeOverlayObject, PulseAnimator } from '../../utils/overlay.js';
	import {
		iterTendonWrapPoints,
		maxBodyGeomSize,
		readCameraMatrix,
		readJointAnchor,
		readJointAxis,
		readLightDir,
		readLightPos,
		readSitePos
	} from '../../utils/modelAccess.js';
	import type { MujocoModel } from '../../types.js';

	type Props = {
		color?: string;
	};
	let { color = '#60a5fa' }: Props = $props();

	const sim = useMujocoContext();

	let root = $state<THREE.Group>();

	type Marker = {
		obj: THREE.Object3D;
		update: (t: number) => void;
		dispose: () => void;
	};
	let currentMarker: Marker | null = null;

	// A single pulse animator drives joint/tendon selection markers — those
	// benefit from the gentle scale swing (directional hint + breathing feel).
	const SELECTION_PULSE = new PulseAnimator({
		baseScale: 1,
		baseOpacity: 0.85,
		scaleAmp: 0.15,
		opacityAmp: 0.18,
		speed: 4
	});

	// Camera / light markers keep their glyph shape perfectly static — scaling
	// a frustum or a light cone by ±15% reads as the object literally moving,
	// which is jarring. They get a softer opacity-only breath instead.
	const STATIC_PULSE = new PulseAnimator({
		baseScale: 1,
		baseOpacity: 0.9,
		scaleAmp: 0,
		opacityAmp: 0.15,
		speed: 3
	});

	/**
	 * Build a "ping" halo — a translucent sphere that repeatedly expands out
	 * and fades. Used on camera/light markers to telegraph "selected" without
	 * distorting the glyph itself. The halo sits at the entity's origin (the
	 * caller positions the parent group) and loops through `[1, maxScale]` /
	 * `[1, 0]` opacity every `period` seconds.
	 */
	function makePingHalo(
		col: THREE.Color,
		baseRadius: number,
		opts: { period?: number; maxScale?: number; peakOpacity?: number } = {}
	): {
		obj: THREE.Mesh;
		update: (t: number) => void;
		dispose: () => void;
	} {
		const period = opts.period ?? 1.6;
		const maxScale = opts.maxScale ?? 2.6;
		const peakOpacity = opts.peakOpacity ?? 0.55;

		const geom = new THREE.SphereGeometry(baseRadius, 16, 12);
		const mat = new THREE.MeshBasicMaterial({
			color: col,
			transparent: true,
			opacity: peakOpacity,
			depthWrite: false
		});
		const sphere = new THREE.Mesh(geom, mat);
		// Overlay config: always on top, doesn't block raycasting, additive
		// blending so it blends into the glyph without looking opaque.
		makeOverlayObject(sphere, {
			renderOrder: 1000,
			opacity: peakOpacity,
			additive: true
		});

		return {
			obj: sphere,
			update: (t: number) => {
				// Cycle 0 → 1 over `period` seconds. Ease with a smoothstep so the
				// ping visibly accelerates out of the origin and settles at the
				// edges (rather than a mechanical linear sweep).
				const phase = (t % period) / period;
				const eased = phase * phase * (3 - 2 * phase);
				const scale = 1 + (maxScale - 1) * eased;
				// Fade with `1 - phase` (linear) — the ping should disappear
				// before it restarts to avoid a double-ping visual at the loop.
				const opacity = peakOpacity * (1 - phase);
				sphere.scale.setScalar(scale);
				mat.opacity = Math.max(0, opacity);
			},
			dispose: () => {
				geom.dispose();
				mat.dispose();
			}
		};
	}

	// Resolve to the *effective* entity to represent. Actuator selections
	// forward to their transmission joint so the marker appears at the driven
	// joint rather than on nothing. Body/geom are already covered elsewhere.
	type Effective =
		| null
		| { kind: 'joint'; id: number }
		| { kind: 'light'; id: number }
		| { kind: 'camera'; id: number }
		| { kind: 'tendon'; id: number }
		| { kind: 'site'; id: number };

	const effective = $derived.by<Effective>(() => {
		// Bail during reloads — `sim.mjModel` can point to a freed emscripten
		// handle briefly before the new model arrives, and any getter call
		// (`njnt`, `nlight`, …) throws `BindingError: … on deleted object`.
		if (sim.status !== 'ready') return null;
		const sel = sim.selection;
		const model = sim.mjModel;
		if (!sel || !model) return null;
		if (sel.id < 0) return null;

		try {
			switch (sel.kind) {
				case 'joint':
					return sel.id < model.njnt ? { kind: 'joint', id: sel.id } : null;
				case 'light':
					return sel.id < (model.nlight ?? 0) ? { kind: 'light', id: sel.id } : null;
				case 'camera':
					return sel.id < (model.ncam ?? 0) ? { kind: 'camera', id: sel.id } : null;
				case 'tendon':
					return sel.id < (model.ntendon ?? 0) ? { kind: 'tendon', id: sel.id } : null;
				case 'site':
					return sel.id < model.nsite ? { kind: 'site', id: sel.id } : null;
				case 'actuator': {
					// Transmission types 0 (joint) / 1 (jointinparent) resolve to a joint.
					// Anything else (site, body, tendon, slider-crank) falls through —
					// site- and tendon-transmissions would need their own resolution
					// paths; easy to add later if users report them missing.
					const trnType = model.actuator_trntype?.[sel.id] ?? -1;
					const trnId = model.actuator_trnid?.[2 * sel.id] ?? -1;
					if (trnId < 0) return null;
					if ((trnType === 0 || trnType === 1) && trnId < model.njnt) {
						return { kind: 'joint', id: trnId };
					}
					return null;
				}
				default:
					return null;
			}
		} catch {
			return null;
		}
	});

	// Rebuild the marker on every selection change. No incremental update —
	// switching kinds changes the object tree wholesale so a plain teardown +
	// build is both simpler and avoids leftover per-kind closure state.
	$effect(() => {
		const g = root;
		if (!g) return;
		const eff = effective;
		const model = sim.mjModel;
		if (!eff || !model || sim.status !== 'ready') return;

		const threeColor = new THREE.Color(color);
		const marker = buildMarker(eff, model, threeColor);
		if (!marker) return;
		g.add(marker.obj);
		currentMarker = marker;

		return () => {
			g.remove(marker.obj);
			marker.dispose();
			if (currentMarker === marker) currentMarker = null;
		};
	});

	useTask(
		() => {
			const m = currentMarker;
			if (!m) return;
			m.update(performance.now() * 0.001);
		},
		{ after: PHYSICS_STEP_KEY }
	);

	// ---------- marker builders ----------

	function buildMarker(eff: Effective, model: MujocoModel, col: THREE.Color): Marker | null {
		if (!eff) return null;
		switch (eff.kind) {
			case 'joint':
				return buildJointMarker(eff.id, model, col);
			case 'light':
				return buildLightMarker(eff.id, model, col);
			case 'camera':
				return buildCameraMarker(eff.id, model, col);
			case 'tendon':
				return buildTendonMarker(eff.id, model, col);
			case 'site':
				return buildSiteMarker(eff.id, model, col);
		}
	}

	// Joint: larger-than-DebugJoints arrow that pulses. Positioned at
	// `body_xpos + body_quat * jnt_pos`, oriented along `body_quat * jnt_axis`.
	function buildJointMarker(jid: number, model: MujocoModel, col: THREE.Color): Marker {
		const bid = model.jnt_bodyid[jid];
		// ~2x the size of the normal DebugJoints arrow so the selection reads
		// clearly even when DebugJoints is toggled on underneath.
		const baseLen = Math.max(maxBodyGeomSize(model, bid) * 1.6, 0.1);
		const arrow = new THREE.ArrowHelper(
			new THREE.Vector3(0, 0, 1),
			new THREE.Vector3(),
			baseLen,
			col,
			baseLen * 0.3,
			baseLen * 0.15
		);
		const lineMat = new THREE.LineBasicMaterial({ color: col });
		arrow.line.material = lineMat;
		const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
		coneMat.color = col;
		makeOverlayObject(arrow, { renderOrder: 1001, opacity: 1 });

		const _q = new THREE.Quaternion();
		const _v = new THREE.Vector3();
		const _scratch = new THREE.Vector3();

		return {
			obj: arrow,
			update: (t) => {
				const data = sim.mjData;
				if (!data) return;
				readJointAnchor(model, data, jid, arrow.position, _q, _scratch);
				if (readJointAxis(model, data, jid, _v, _q)) {
					arrow.setDirection(_v);
				}
				SELECTION_PULSE.apply(arrow, [lineMat, coneMat], t);
			},
			dispose: () => {
				arrow.line.geometry.dispose();
				lineMat.dispose();
				arrow.cone.geometry.dispose();
				coneMat.dispose();
			}
		};
	}

	// Light: mirrors LightGizmos' glyph selection (arrow/cone/sphere by type)
	// with a solid (non-wireframe) material. The glyph stays rigidly at its
	// authored size — a radiating halo ping signals the selection instead.
	function buildLightMarker(lid: number, model: MujocoModel, col: THREE.Color): Marker {
		const type = model.light_type?.[lid] ?? 1;
		const group = new THREE.Group();
		// Child group holds only the glyph so the outer `group` (which the halo
		// also lives on) can be scale-reset safely without nuking glyph pose.
		const glyph = new THREE.Group();
		group.add(glyph);

		const pulseMats: (THREE.Material & { opacity: number })[] = [];
		const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
		let haloRadius = 0.18;

		if (type === 1) {
			// Directional — large bright arrow.
			const arrow = new THREE.ArrowHelper(
				new THREE.Vector3(0, 0, 1),
				new THREE.Vector3(),
				0.4,
				col,
				0.1,
				0.06
			);
			const lineMat = new THREE.LineBasicMaterial({ color: col });
			arrow.line.material = lineMat;
			const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
			coneMat.color = col;
			glyph.add(arrow);
			pulseMats.push(lineMat, coneMat);
			disposables.push(arrow.line.geometry, lineMat, arrow.cone.geometry, coneMat);
			haloRadius = 0.14;
		} else if (type === 0) {
			// Spot — cone along +Z, double size.
			const geom = new THREE.ConeGeometry(0.16, 0.4, 20);
			const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
			const cone = new THREE.Mesh(geom, mat);
			cone.rotation.x = Math.PI;
			glyph.add(cone);
			pulseMats.push(mat);
			disposables.push(geom, mat);
			haloRadius = 0.18;
		} else {
			// Point — bright sphere.
			const geom = new THREE.SphereGeometry(0.08, 16, 12);
			const mat = new THREE.MeshBasicMaterial({ color: col });
			const sphere = new THREE.Mesh(geom, mat);
			glyph.add(sphere);
			pulseMats.push(mat);
			disposables.push(geom, mat);
			haloRadius = 0.1;
		}

		makeOverlayObject(glyph, { renderOrder: 1001, opacity: 1 });

		const ping = makePingHalo(col, haloRadius);
		group.add(ping.obj);

		const _dir = new THREE.Vector3();
		const _up = new THREE.Vector3();
		const _origin = new THREE.Vector3();
		const _m = new THREE.Matrix4();

		return {
			obj: group,
			update: (t) => {
				readLightPos(model, lid, group.position);
				if (readLightDir(model, lid, _dir) && _dir.lengthSq() > 0) {
					_dir.normalize();
					// Pick an up axis that doesn't collapse `lookAt` when the direction
					// is nearly vertical — MuJoCo's lights are often near-z-up.
					_up.set(0, 0, 1);
					if (Math.abs(_dir.z) > 0.99) _up.set(1, 0, 0);
					_origin.set(0, 0, 0);
					_m.lookAt(_origin, _dir, _up);
					// Glyph inherits the orientation so the cone / arrow points along
					// the light direction; halo is the parent `group` so it stays
					// unrotated — a sphere so that's moot anyway.
					glyph.quaternion.setFromRotationMatrix(_m);
				}
				STATIC_PULSE.apply(glyph, pulseMats, t);
				ping.update(t);
			},
			dispose: () => {
				for (const d of disposables) d.dispose();
				ping.dispose();
			}
		};
	}

	// Camera: bright frustum via CameraHelper, plus an accent sphere at the
	// camera position. The frustum stays rigidly at its authored projection;
	// selection is signalled by a radiating halo ping at the camera origin.
	function buildCameraMarker(cid: number, model: MujocoModel, col: THREE.Color): Marker {
		const fovy = model.cam_fovy?.[cid] ?? 45;
		const cam = new THREE.PerspectiveCamera(fovy, 4 / 3, 0.05, 0.6);
		const helper = new THREE.CameraHelper(cam);
		// CameraHelper paints edges via `.setColors` + vertexColors material.
		helper.setColors(col, col, col, col, col);
		const helperMat = helper.material as THREE.LineBasicMaterial;

		const sphereGeom = new THREE.SphereGeometry(0.025, 12, 8);
		const sphereMat = new THREE.MeshBasicMaterial({ color: col });
		const sphere = new THREE.Mesh(sphereGeom, sphereMat);

		// `glyph` holds the frustum + origin sphere and stays at scale=1 — no
		// more frustum-swing. `group` hosts the halo ping which lives in world
		// space at the camera origin.
		const glyph = new THREE.Group();
		glyph.add(helper);
		glyph.add(sphere);
		makeOverlayObject(glyph, { renderOrder: 1001, opacity: 1 });
		// Sphere sits a tick above the frustum so it reads as a separate accent.
		sphere.renderOrder = 1002;

		const ping = makePingHalo(col, 0.04);
		const group = new THREE.Group();
		group.add(glyph);
		group.add(ping.obj);

		const _mat = new THREE.Matrix4();
		const _pingPos = new THREE.Vector3();

		return {
			obj: group,
			update: (t) => {
				const data = sim.mjData;
				if (!data) return;
				if (readCameraMatrix(data, cid, _mat)) {
					cam.position.setFromMatrixPosition(_mat);
					cam.quaternion.setFromRotationMatrix(_mat);
					sphere.position.copy(cam.position);
					_pingPos.copy(cam.position);
				}
				cam.updateMatrixWorld(true);
				helper.update();
				// Halo rides the camera origin; the frustum is parented through
				// `helper` which takes its pose from `cam` above.
				ping.obj.position.copy(_pingPos);
				STATIC_PULSE.apply(glyph, [helperMat, sphereMat], t);
				ping.update(t);
			},
			dispose: () => {
				helperMat.dispose();
				sphereGeom.dispose();
				sphereMat.dispose();
				ping.dispose();
				// CameraHelper's geometry is created internally; GC cleans it up.
			}
		};
	}

	// Tendon: rebuild a thick bright tube each frame along the wrap points.
	// Uses the same path as TendonRenderer but with larger radius + solid color.
	function buildTendonMarker(tid: number, model: MujocoModel, col: THREE.Color): Marker {
		const mat = new THREE.MeshBasicMaterial({ color: col });
		const placeholder = new THREE.BufferGeometry();
		const mesh = new THREE.Mesh(placeholder, mat);
		makeOverlayObject(mesh, { renderOrder: 1001, opacity: 1 });

		const _points: THREE.Vector3[] = [];
		let lastGeom: THREE.BufferGeometry = placeholder;

		return {
			obj: mesh,
			update: (t) => {
				const data = sim.mjData;
				if (!data) return;
				_points.length = 0;
				for (const [x, y, z] of iterTendonWrapPoints(model, data, tid)) {
					_points.push(new THREE.Vector3(x, y, z));
				}
				if (_points.length < 2) {
					mesh.visible = false;
					return;
				}
				mesh.visible = true;
				const curve = new THREE.CatmullRomCurve3(_points, false);
				// ~3x the normal tendon width.
				const geom = new THREE.TubeGeometry(
					curve,
					Math.max(_points.length * 2, 4),
					0.006,
					8,
					false
				);
				mesh.geometry = geom;
				if (lastGeom !== placeholder) lastGeom.dispose();
				lastGeom = geom;
				mat.opacity = SELECTION_PULSE.factors(t).opacity;
			},
			dispose: () => {
				if (lastGeom !== placeholder) lastGeom.dispose();
				placeholder.dispose();
				mat.dispose();
			}
		};
	}

	// Site: bright double-size octahedron at `site_xpos`.
	function buildSiteMarker(sid: number, model: MujocoModel, col: THREE.Color): Marker {
		const siteSize = (model as unknown as { site_size?: Float64Array }).site_size;
		let radius = 0.012;
		if (siteSize) {
			radius = Math.max(siteSize[3 * sid] * 0.8, 0.008);
		} else {
			const extent = maxBodyGeomSize(model, model.site_bodyid[sid]);
			if (extent > 0) radius = extent * 0.25;
		}
		const geom = new THREE.OctahedronGeometry(radius);
		const mat = new THREE.MeshBasicMaterial({ color: col });
		const mesh = new THREE.Mesh(geom, mat);
		makeOverlayObject(mesh, { renderOrder: 1001, opacity: 1 });

		// Site marker uses a larger scale swing than the shared pulse — it's a
		// small marker and the extra "breathing" helps it read against busy
		// backgrounds.
		const sitePulse = new PulseAnimator({
			baseScale: 1,
			baseOpacity: 0.85,
			scaleAmp: 0.25,
			opacityAmp: 0.18,
			speed: 4
		});

		return {
			obj: mesh,
			update: (t) => {
				const data = sim.mjData;
				if (!data) return;
				readSitePos(data, sid, mesh.position);
				sitePulse.apply(mesh, mat, t);
			},
			dispose: () => {
				geom.dispose();
				mat.dispose();
			}
		};
	}
</script>

{#if sim.status === 'ready'}
	<T.Group bind:ref={root} />
{/if}
