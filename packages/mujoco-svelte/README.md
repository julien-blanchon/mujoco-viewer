# mujoco-svelte

Svelte 5 + [Threlte](https://threlte.xyz) bindings on top of the official [mujoco-js](https://www.npmjs.com/package/mujoco-js) WASM build. Drop a MuJoCo model into a Three.js scene with reactive state, per-frame hooks, and support for MJCF's include graph + asset references.

> **Status:** workspace-internal package backing the [MuJoCo Viewer VS Code extension](../../apps/vscode-extension/). Public API is stabilising; treat as unversioned until 1.0.

## What it gives you

- `<MujocoProvider>` / `<MujocoCanvas>` / `<MujocoPhysics>` — Svelte components that bootstrap the WASM runtime, run the physics loop, and render bodies into a Three.js scene.
- `MujocoSimState` — reactive access to the loaded model (bodies, joints, geoms, cameras, etc.), selection, hover, and per-step time.
- `loadScene()` — resolves an MJCF file, its `<include>` graph, and mesh / texture / heightfield assets. Pass a custom `fileLoader` to load from anywhere (workspace, File System Access API, IndexedDB, …).
- `XmlIndex` + `XmlEditOps` — text-level edit primitives (`setAttr`, `removeAttr`, `rename`, `removeElement`) that round-trip through MuJoCo's compiler so the edits survive a reload.
- `useBeforePhysicsStep` / `useAfterPhysicsStep` — per-frame hooks that run inside the physics tick.

## Minimal example

```svelte
<script lang="ts">
  import { MujocoProvider, MujocoCanvas, MujocoPhysics } from 'mujoco-svelte';
</script>

<MujocoProvider>
  <MujocoCanvas config={{ src: '/models/', sceneFile: 'humanoid.xml' }}>
    <MujocoPhysics />
  </MujocoCanvas>
</MujocoProvider>
```

## Custom file loading

The `fileLoader` hook lets you provide the raw bytes for any asset the scene references, bypassing the default `fetch(src + path)`:

```ts
const config: SceneConfig = {
  src: '/placeholder/',
  sceneFile: 'scene.xml',
  fileLoader: async (path) => {
    const file = await myWorkspace.read(path); // your storage
    return file ?? null; // null → fall back to fetch(src + path)
  },
};
```

That's the seam the VS Code extension uses to serve files directly from the editor, and the debug web app uses to serve them from a `FileSystemDirectoryHandle`.

## Peer dependencies

- `svelte` ≥ 5
- `@threlte/core` ≥ 8
- `three` ≥ 0.160

## License

MIT (the package itself). The bundled MuJoCo WASM is Apache-2.0 — see [mujoco-js](https://www.npmjs.com/package/mujoco-js).
