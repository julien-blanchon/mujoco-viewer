# debug

Standalone browser app for iterating on the viewer UI without launching VS Code.

Same `<ViewerApp>` as the extension mounts, just with a different `HostAdapter` — one that talks to the File System Access API instead of the VS Code message bus.

## Run

```bash
bun install
bun run --filter debug dev
```

Visit `http://localhost:5173`. Click **Open folder** and point at a directory containing a MuJoCo scene — you should see the same viewer the extension shows, and Save writes back to disk in-place.

There's a set of ready-to-use models under `debug/fixtures/` (Cassie, Shadow Hand, Skydio X2, humanoid, …) if you don't have one handy.

Two fixtures aren't tracked in git because they're huge (the Unitree G1 and `procthor-10k-train`). Drop them into `debug/fixtures/g1/` and `debug/fixtures/procthor-10k-train/` from their upstream sources if you need them.

## Requirements

- **A Chromium-based browser** — Chrome, Edge, Arc, Brave. The File System Access API (`showDirectoryPicker`) isn't available in Firefox or Safari yet.
- A local folder with at least one `.xml` MJCF file. Meshes and includes resolve relative to that folder.

## What this app is for

- Hot-reload iteration on the viewer UI without the VS Code launch dance (`F5`, extension host, reload).
- Reproducing adapter-independent bugs outside the extension. If something breaks here, it's not VS Code-specific.
- Demoing the viewer without asking someone to install an extension.

It is **not** a replacement for the VS Code extension — no compile-error panel integration, no editor-side schema registration, no multi-session UI. It shares the 3D + inspector surface; that's it.
