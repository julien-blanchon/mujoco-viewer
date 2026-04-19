<!--
@component
WorldInteractivity — installs `interactivity()` from `@threlte/extras` and
wraps its children so any descendant inside `<Canvas>` can use
`useInteractivity()`.

Svelte contexts propagate downward, so this *must* wrap the scene: rendering
it as a sibling of `<MujocoPhysics>` would leave the physics tree without the
interactivity context. Typical placement:

```svelte
<Canvas>
  <WorldInteractivity>
    <MujocoPhysics config={...}>
      ...
    </MujocoPhysics>
  </WorldInteractivity>
</Canvas>
```

`clickDistanceThreshold` is tuned so a small pointer drag (e.g. an
OrbitControls orbit) doesn't register as a click.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as THREE from 'three';
	import { interactivity } from '@threlte/extras';
	import type { InteractivityProps } from '@threlte/extras';

	type Props = {
		/** Max px between pointerdown and up for a click. Drags above this won't select. */
		clickDistanceThreshold?: number;
		/** Max ms between pointerdown and up for a click. */
		clickTimeThreshold?: number;
		/** Optional override event target (defaults to the renderer's canvas). */
		target?: HTMLElement;
		/** Fires when a click lands on empty space (no interactive hit). */
		onpointermissed?: InteractivityProps['onpointermissed'];
		children?: Snippet;
	};

	let {
		clickDistanceThreshold = 4,
		clickTimeThreshold = 350,
		target,
		onpointermissed,
		children
	}: Props = $props();

	// `interactivity()` is a one-shot installer; subsequent prop changes would
	// not re-run the call. These reads intentionally capture the initial values.
	// svelte-ignore state_referenced_locally
	const ctx = interactivity({ clickDistanceThreshold, clickTimeThreshold, target });

	// Forward the "missed" event — handy for "clicking empty space clears the
	// selection". Must be a real `THREE.Object3D` so the plugin's raycaster
	// (which intersects every item in `interactiveObjects`) can safely skip it;
	// a plain `{}` breaks on `object.layers.test(...)` inside three's Raycaster.
	// The default `raycast()` is a no-op for a bare Object3D, so it never reports
	// a hit — only the pointermissed path uses the handlers map.
	$effect(() => {
		if (!onpointermissed) return;
		const marker = new THREE.Object3D();
		ctx.addInteractiveObject(marker, {
			onpointermissed: onpointermissed as unknown as (arg: unknown) => void
		});
		return () => ctx.removeInteractiveObject(marker);
	});
</script>

{@render children?.()}
