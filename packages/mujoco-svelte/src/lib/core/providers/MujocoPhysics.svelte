<!--
@component
MujocoPhysics — physics provider for use inside a user-owned Threlte `<Canvas>`.

This is the canvas-agnostic alternative to `<MujocoCanvas>`. Instead of wrapping the
canvas, drop this inside your own `<Canvas>`:

```svelte
<MujocoProvider>
  <Canvas>
    <MujocoPhysics config={...} bind:paused>
      <SceneRenderer />
      <OrbitControls />
    </MujocoPhysics>
  </Canvas>
</MujocoProvider>
```

`paused`, `speed`, `selectedBodyId`, and `api` are `$bindable`. Internal
writes (e.g. a double-click selecting a body, or a component flipping
`sim.paused = !sim.paused`) propagate back up because the sim owns the
reactive `$state` — the pair of `$effect.pre`/`$effect` hooks below
guards against loops with an identity check.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onDestroy, setContext, untrack } from 'svelte';
	import { useTask } from '@threlte/core';
	import { MUJOCO_SIM_KEY, useMujocoWasm } from '../context.js';
	import { MujocoSimState } from '../state/MujocoSimState.svelte.js';
	import { PHYSICS_STEP_KEY } from '../frameKeys.js';
	import { LocalEngine } from '../engine/LocalEngine.js';
	import SceneRenderer from '../../components/scene/SceneRenderer.svelte';
	import { getName } from '../SceneLoader.js';
	import type { MujocoModule, MujocoSimAPI, SceneConfig } from '../../types.js';

	type Props = {
		/** Scene/robot configuration. */
		config: SceneConfig;
		/** Fires when model is loaded and API is ready. */
		onReady?: (api: MujocoSimAPI) => void;
		/** Fires on scene load failure. */
		onError?: (error: Error) => void;
		/** Called each physics step. */
		onStep?: (time: number) => void;
		/** Called on body double-click selection. */
		onSelection?: (bodyId: number, name: string) => void;
		/** Override model gravity. */
		gravity?: [number, number, number];
		/** Override model.opt.timestep. */
		timestep?: number;
		/** mj_step calls per frame. */
		substeps?: number;
		/** Pause the sim. `bind:paused` supported. */
		paused?: boolean;
		/** Simulation speed multiplier. `bind:speed` supported. */
		speed?: number;
		/** Body id of the last selection. `bind:selectedBodyId` supported. */
		selectedBodyId?: number | null;
		/** Skip the built-in SceneRenderer. */
		skipSceneRenderer?: boolean;
		/** `bind:api` — set to the resolved API once `status === 'ready'`. */
		api?: MujocoSimAPI | null;
		children?: Snippet;
	};

	let {
		config,
		onReady,
		onError,
		onStep,
		onSelection,
		gravity,
		timestep,
		substeps,
		paused = $bindable(false),
		speed = $bindable(1),
		selectedBodyId = $bindable<number | null>(null),
		skipSceneRenderer = false,
		api = $bindable(null),
		children
	}: Props = $props();

	const wasmCtx = useMujocoWasm();

	if (wasmCtx.status !== 'ready') {
		throw new Error(
			'<MujocoPhysics> requires a ready <MujocoProvider>. Gate this component on `useMujocoWasm().status === "ready"` (or use <MujocoCanvas>, which does the gating for you).'
		);
	}

	// svelte-ignore state_referenced_locally
	const engine = new LocalEngine(wasmCtx.mujoco as MujocoModule, config);

	// svelte-ignore state_referenced_locally
	// Constructor-level callbacks fire once — one-shot `onReady` / `onError`.
	// Step/selection callbacks are wired reactively below so a prop swap
	// replaces the active subscription instead of doubling up.
	const sim = new MujocoSimState({
		engine,
		config,
		onReady,
		onError,
		gravity,
		timestep,
		substeps,
		paused,
		speed
	});
	setContext(MUJOCO_SIM_KEY, sim);

	untrack(() => sim.init());

	// Reactive prop → sim plumbing for non-bindable fields + world options.
	$effect.pre(() => {
		sim.substeps = substeps ?? 1;
		if (sim.status !== 'ready') return;
		const model = sim.mjModel;
		if (!model) return;
		// `model.opt` is an emscripten handle; accessing it on a freed model
		// throws `BindingError`. The status guard above covers the common
		// case but try/catch is the last mile during reload transitions.
		try {
			if (gravity && model.opt?.gravity) {
				model.opt.gravity[0] = gravity[0];
				model.opt.gravity[1] = gravity[1];
				model.opt.gravity[2] = gravity[2];
			}
			if (timestep !== undefined && model.opt) model.opt.timestep = timestep;
		} catch {
			/* freed mid-transition; the next 'ready' re-applies via engine.on('ready') */
		}
	});

	// Event subscriptions — each callback prop owns a subscription whose
	// cleanup fires when the prop identity changes or the component unmounts.
	// A no-op when the prop is undefined.
	$effect(() => {
		if (!onStep) return;
		return sim.on('step', onStep);
	});
	$effect(() => {
		const cb = onSelection;
		if (!cb) return;
		return sim.on('selection', (sel) => {
			if (sel?.kind !== 'body') return;
			const model = sim.mjModel;
			const name = model ? getName(model, model.name_bodyadr[sel.id]) : '';
			cb(sel.id, name);
		});
	});

	// Two-way bindings: sim owns the reactive $state, the component `$bindable`
	// props mirror it. Each pair is (prop → sim) then (sim → prop) with equality
	// guards — Svelte coalesces so we never loop.
	$effect.pre(() => {
		if (paused !== sim.paused) sim.paused = paused;
	});
	$effect(() => {
		if (sim.paused !== paused) paused = sim.paused;
	});

	$effect.pre(() => {
		if (speed !== sim.speed) sim.speed = speed;
	});
	$effect(() => {
		if (sim.speed !== speed) speed = sim.speed;
	});

	// selectedBodyId is a legacy view over `sim.selection` (body only). We must
	// only propagate prop → sim when the *caller* actually changed the prop;
	// otherwise, every body selection elsewhere (scene tree, viewport click)
	// trips this effect.pre — because the getter now returns a new non-null id
	// while the unbound prop is still at its null default — and the sync fires
	// `sim.selectedBodyId = null`, wiping the selection before the rest of the
	// app sees it. Tracking the last-observed prop value lets us distinguish
	// "prop default" from "caller-initiated change".
	let lastExternalSelectedBodyId: number | null = selectedBodyId;
	$effect.pre(() => {
		if (selectedBodyId !== lastExternalSelectedBodyId) {
			lastExternalSelectedBodyId = selectedBodyId;
			if (selectedBodyId !== sim.selectedBodyId) sim.selectedBodyId = selectedBodyId;
		}
	});
	$effect(() => {
		if (sim.selectedBodyId !== selectedBodyId) {
			selectedBodyId = sim.selectedBodyId;
			lastExternalSelectedBodyId = sim.selectedBodyId;
		}
	});

	// Expose the API once ready.
	$effect(() => {
		api = sim.status === 'ready' ? sim.api : null;
	});

	// Physics step — other tasks use `after: PHYSICS_STEP_KEY`.
	useTask(
		PHYSICS_STEP_KEY,
		(delta) => {
			sim.step(delta);
		},
		{ autoInvalidate: false }
	);

	onDestroy(() => sim.dispose());
</script>

{#if !skipSceneRenderer}
	<SceneRenderer />
{/if}
{@render children?.()}
