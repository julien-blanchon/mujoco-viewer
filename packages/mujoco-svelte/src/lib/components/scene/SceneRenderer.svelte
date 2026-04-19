<!--
@component
SceneRenderer — creates and syncs MuJoCo body meshes every frame.

Auto-mounted by `<MujocoPhysics>` (pass `skipSceneRenderer` to opt out).

When an ancestor installed `interactivity()` (see `<WorldInteractivity>`),
each geom mesh is registered so descendant hover/click lands on the finest
visible element:

  - onpointerenter → `sim.hoveredGeomId = gid`
  - onpointerleave → clears hover if still on this geom
  - onclick        → `sim.selection = { kind: 'geom', id: gid }`

Bodies don't receive events directly — clicking any of their geoms is the
selection path. The per-geom handlers call `stopPropagation()` so the parent
(body group) doesn't double-dispatch.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as THREE from 'three';
	import { T, useTask, useThrelte } from '@threlte/core';
	import { useInteractivity } from '@threlte/extras';
	import { getName } from '../../core/SceneLoader.js';
	import { useMujocoContext } from '../../core/context.js';
	import { PHYSICS_STEP_KEY } from '../../core/frameKeys.js';
	import { useVisualOptions } from '../../core/state/VisualOptions.svelte.js';
	import { GeomBuilder } from '../../rendering/GeomBuilder.js';
	import { MaterialFactory } from '../../rendering/MaterialFactory.js';
	import { TextureCache } from '../../rendering/TextureDecoder.js';
	import { readBodyPos, readBodyQuat } from '../../utils/modelAccess.js';
	import type { MujocoModel } from '../../types.js';

	// Threlte's `interactivity()` dispatches pointer/click events with a small,
	// stopPropagation-capable shape; `nativeEvent` is present on click/pointer
	// events but not on enter/leave. We model just the surface we use so our
	// handlers are typed end-to-end, and cast once at the registration boundary
	// (Threlte's upstream signature is `(arg: unknown) => void`).
	type InteractivityEvent = {
		stopPropagation: () => void;
		nativeEvent?: MouseEvent;
	};
	type InteractivityHandler = (event: InteractivityEvent) => void;
	type ThrelteLooseHandler = (arg: unknown) => void;
	type InteractivityRegistration = {
		addInteractiveObject: (
			obj: THREE.Object3D,
			events: Record<string, ThrelteLooseHandler>
		) => void;
		removeInteractiveObject: (obj: THREE.Object3D) => void;
	};

	// Gracefully opt out if the consumer did not install `interactivity()` inside
	// the Canvas — selection stops working but physics/rendering still does.
	let interactivity: InteractivityRegistration | null = null;
	try {
		interactivity = useInteractivity();
	} catch {
		// no-op
	}

	type Props = {
		visible?: boolean;
		onSelectBody?: (bodyId: number, name: string) => void;
		children?: Snippet;
	};

	let { visible = true, onSelectBody, children }: Props = $props();

	const sim = useMujocoContext();
	const visualOptions = useVisualOptions();
	const { scene } = useThrelte();

	let group = $state<THREE.Group>();
	let bodyRefs: THREE.Group[] = [];
	let interactiveMeshes: THREE.Object3D[] = [];
	let prevModel: MujocoModel | null = null;
	let textureCache: TextureCache | null = null;
	let materialFactory: MaterialFactory | null = null;
	let previousSceneBackground: THREE.Scene['background'] = null;

	function registerGeomInteractivity(mesh: THREE.Object3D, geomId: number, bodyId: number): void {
		if (!interactivity) return;
		// Stop propagation in every handler so only the *nearest* hit fires.
		// Without this, pointer events dispatch on every object under the ray
		// in distance order, and each one overwrites the previous — the effect
		// is that the back-most object wins, which is the opposite of what the
		// user expects.
		const onPointerEnter: InteractivityHandler = (e) => {
			e.stopPropagation();
			sim.hoveredGeomId = geomId;
		};
		const onPointerLeave: InteractivityHandler = (e) => {
			e.stopPropagation();
			if (sim.hoveredGeomId === geomId) sim.hoveredGeomId = null;
		};
		const onClick: InteractivityHandler = (e) => {
			e.stopPropagation();
			// Select the specific geom under the pointer — that's the finest
			// level of detail and what hover visuals already telegraph. The
			// GeomInspector exposes a clickable body link to drill outward.
			// Shift+click escalates to the parent body for quick "inspect
			// the whole limb" flows.
			const shift = !!e.nativeEvent?.shiftKey;
			if (shift && bodyId > 0) {
				sim.selection = { kind: 'body', id: bodyId };
			} else {
				sim.selection = { kind: 'geom', id: geomId };
			}
			// `sim.selection = …` above already fires the `selection` event for
			// anything listening via `sim.on('selection', …)`. We still invoke
			// the component-local `onSelectBody` prop here so in-tree consumers
			// get a synchronous callback without subscribing.
			if (bodyId > 0) {
				const model = sim.mjModel;
				const name = model ? getName(model, model.name_bodyadr[bodyId]) : '';
				onSelectBody?.(bodyId, name);
			}
		};

		interactivity.addInteractiveObject(mesh, {
			onpointerenter: onPointerEnter,
			onpointerleave: onPointerLeave,
			onclick: onClick
		} as unknown as Record<string, ThrelteLooseHandler>);
		interactiveMeshes.push(mesh);
	}

	function disposeSubtreeGeometries(root: THREE.Object3D): void {
		root.traverse((o) => {
			const mesh = o as Partial<THREE.Mesh>;
			mesh.geometry?.dispose?.();
		});
	}

	function clearInteractivity(): void {
		if (!interactivity) {
			interactiveMeshes = [];
			return;
		}
		for (const m of interactiveMeshes) interactivity.removeInteractiveObject(m);
		interactiveMeshes = [];
	}

	function rebuild() {
		if (sim.status !== 'ready') return;
		const model = sim.mjModel;
		const g = group;
		if (!model || !g) return;
		if (prevModel === model) return;
		prevModel = model;

		// Tear down previous body groups, per-geom interactivity registrations,
		// and cached textures/materials from the last load. Geometries here are
		// freshly allocated by GeomBuilder on every rebuild — walk the subtree
		// and dispose them before losing the references so GPU buffers don't
		// leak across reloads. Materials stay owned by MaterialFactory.
		clearInteractivity();
		disposeSubtreeGeometries(g);
		while (g.children.length > 0) g.remove(g.children[0]);
		materialFactory?.dispose();
		textureCache?.dispose();
		sim.hoveredGeomId = null;

		// Decode textures lazily; the skybox (if present) also doubles as envMap
		// for materials with reflectance > 0. We attach the cube directly to
		// reflective materials (via MaterialFactory) rather than through
		// `scene.environment`, because the latter kicks off PMREM generation
		// which rejects UnsignedByteType cube textures on some drivers.
		textureCache = new TextureCache(model);
		const skybox = textureCache.skybox();
		if (skybox) {
			if (previousSceneBackground === null) previousSceneBackground = scene.background;
			scene.background = !visualOptions || visualOptions.render.skybox ? skybox : null;
		} else {
			scene.background = previousSceneBackground;
		}
		materialFactory = new MaterialFactory(model, textureCache, {
			envMap: skybox,
			defaultMetalness: 0.08,
			defaultRoughness: 0.65
		});

		const useReflector = !visualOptions || visualOptions.render.reflection;
		const builder = new GeomBuilder(sim.mujoco, materialFactory, { useReflector });
		const refs: THREE.Group[] = [];
		for (let i = 0; i < model.nbody; i++) {
			const bodyGroup = new THREE.Group();
			bodyGroup.userData.bodyID = i;
			for (let gi = 0; gi < model.ngeom; gi++) {
				if (model.geom_bodyid[gi] === i) {
					const mesh = builder.create(model, gi);
					if (!mesh) continue;
					bodyGroup.add(mesh);
					// Skip the worldbody (body 0) so clicks on the ground plane
					// don't steal selection from nearby dynamic bodies.
					if (i > 0) registerGeomInteractivity(mesh, gi, i);
				}
			}
			g.add(bodyGroup);
			refs.push(bodyGroup);
		}
		bodyRefs = refs;
	}

	// Rebuild whenever the model identity changes.
	$effect(() => {
		void sim.status;
		void sim.mjModel;
		rebuild();

		return () => {
			clearInteractivity();
			materialFactory?.dispose();
			textureCache?.dispose();
			materialFactory = null;
			textureCache = null;
			prevModel = null;
			if (previousSceneBackground !== null) {
				scene.background = previousSceneBackground;
				previousSceneBackground = null;
			}
		};
	});

	// Keep scene.background in sync with the skybox toggle while mounted.
	// "Off" → `null` (renderer clear color), not `previousSceneBackground`,
	// so the toggle is symmetric regardless of what the original was.
	$effect(() => {
		if (!visualOptions) return;
		const wantSky = visualOptions.render.skybox;
		const sky = textureCache?.skybox();
		if (!sky) return;
		scene.background = wantSky ? sky : null;
	});

	// Sync body poses from data.xpos/xquat each frame after physics step.
	useTask(
		(_delta) => {
			if (sim.status !== 'ready') return;
			const data = sim.mjData;
			if (!data) return;
			try {
				for (let i = 0; i < bodyRefs.length; i++) {
					const ref = bodyRefs[i];
					if (!ref) continue;
					readBodyPos(data, i, ref.position);
					readBodyQuat(data, i, ref.quaternion);
				}
			} catch {
				/* freed mid-frame — next 'ready' rebuilds */
			}
		},
		{ after: PHYSICS_STEP_KEY }
	);
</script>

<T.Group bind:ref={group} {visible}>
	{@render children?.()}
</T.Group>
