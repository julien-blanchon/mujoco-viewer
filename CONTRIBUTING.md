# Contributing

Thanks for taking a look. This is a bun-workspaces monorepo; one install covers everything.

## Repo layout

```
mujoco-viewer/
├── apps/vscode-extension/   VS Code extension (host + webview bundle)
├── debug/                   Standalone browser app (File System Access API)
├── packages/
│   ├── mujoco-svelte/       Threlte + MuJoCo WASM library
│   ├── viewer-ui/           Reusable viewer UI (scene, panels, edit session)
│   └── protocol/            HostAdapter interface + message types
├── assets/                  Marketing screenshots (not shipped)
└── schemas/                 MuJoCo XSD (shipped inside the extension)
```

The viewer UI never touches a platform — it takes a `HostAdapter` and calls into it. Extension and debug app each provide their own adapter:

```
           ┌────────────────────┐         ┌───────────────────┐
           │  VS Code extension │         │ debug web app     │
           │    host (node)     │         │                   │
           └─────────┬──────────┘         └──────────┬────────┘
                     │ postMessage                    │ File System API
           ┌─────────▼──────────┐         ┌──────────▼────────┐
           │   vscodeAdapter    │         │   browserAdapter  │
           └─────────┬──────────┘         └──────────┬────────┘
                     │                               │
                     │     @mujoco-viewer/protocol   │
                     │          HostAdapter          │
                     └──────────────┬────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   <ViewerApp>       │   ← viewer-ui
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   mujoco-svelte     │
                         │   (Threlte + WASM)  │
                         └─────────────────────┘
```

## Prerequisites

- [Bun](https://bun.sh) 1.2+
- Node 20+ (only needed for `vsce` packaging)
- Chromium-based browser for the debug app (Firefox / Safari lack File System Access API)

```bash
bun install
```

## Development

### Iterate on the UI (fastest loop)

```bash
bun run --filter debug dev
```

Point a browser at `http://localhost:5173` and open a model folder. HMR picks up changes under `packages/viewer-ui/` and `packages/mujoco-svelte/` without a full reload.

There's a set of fixture scenes under `debug/fixtures/` (Cassie, humanoid, Shadow Hand, Skydio X2, …) if you don't have one handy.

### Iterate on the VS Code extension

```bash
bun run --filter apps/vscode-extension dev
```

Runs host (esbuild watch) and webview (Vite watch) side-by-side. Then press **F5** in VS Code to launch the Extension Development Host, or:

```bash
bun run --filter apps/vscode-extension launch:code   # opens humanoid fixture
bun run --filter apps/vscode-extension launch:cursor # same, Cursor edition
```

Webview DevTools: in the EDH window, `Developer: Open Webview Developer Tools`.

### Typecheck

```bash
bun run typecheck   # runs svelte-check + tsc --noEmit across all workspaces
```

Runs in parallel; clean exit means every package typechecks.

### Build

```bash
bun run build                        # every package
bun run --filter apps/vscode-extension build    # just the extension
bun run --filter apps/vscode-extension package  # build + produce a .vsix
```

## Where to make a change

| If you're touching…                    | …it lives in                                           |
| -------------------------------------- | ------------------------------------------------------ |
| Physics, rendering, WASM bindings      | `packages/mujoco-svelte/`                              |
| Scene tree, inspectors, panels, edits  | `packages/viewer-ui/`                                  |
| HostAdapter surface or message types   | `packages/protocol/` (update both adapters afterwards) |
| VS Code host (commands, settings, fs)  | `apps/vscode-extension/src/host/`                      |
| Webview adapter (VSCode ↔ ViewerApp)   | `apps/vscode-extension/src/webview/`                   |
| Browser adapter (File System Access)   | `debug/src/`                                           |

## Code style

- Svelte 5 runes everywhere — no legacy stores. Use `$state.raw` for Three.js objects; plain `$state` proxies will loop.
- Keep Three.js work inside a Threlte `Canvas` subtree, DOM work outside. Physics hooks (`useAfterPhysicsStep`) are canvas-only.
- Prefer wrappers over sibling components for Threlte contexts (`interactivity()` propagates to descendants, not siblings).
- Default to no comments. Add one only when the *why* would surprise a reader.
- No `console.log` in library code; route through `adapter.log()` when available.

## Opening a PR

- Branch from `main`.
- Confirm `bun run typecheck` passes locally.
- If you changed the HostAdapter surface, update *both* adapters (`vscodeAdapter.svelte.ts` and `browserAdapter.svelte.ts`) in the same PR.
- If you added a setting, it lives in three places: `packages/protocol/src/settings.ts`, `apps/vscode-extension/package.json` (`contributes.configuration`), and — if it changes viewer behaviour — the read path in `apps/vscode-extension/src/host/settings.ts`.
- Describe *why* in the PR body. The *what* is in the diff.
