# @mujoco-viewer/protocol

Shared types between the MuJoCo Viewer's host (VSCode extension or debug web app) and its webview UI.

- `HostAdapter` — the interface `<ViewerApp>` consumes. Every platform writes its own implementation (message bus, File System Access API, etc.).
- `HostToWebview` / `WebviewToHost` — discriminated message unions for the VSCode `postMessage` protocol.
- `LoadModelPayload`, `LoadedFile`, `ThemeKind` — supporting types.

Internal workspace package; not published.
