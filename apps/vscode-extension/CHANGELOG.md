# Changelog

All notable changes to the MuJoCo Viewer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-04-19

### Changed

- **README rewritten for the Marketplace** — leads with what the extension is for; screenshots use absolute raw.githubusercontent URLs so they render on the listing page.
- **`*.mujoco.xml` is now a first-class MJCF suffix** alongside `*.mjcf.xml` — both trigger `mjcfOnly` default-viewer mode and auto-register the bundled XSD with Red Hat XML.

### Added

- **Schema-validation walkthrough** in the README with example screenshots (attribute completion, enum completion, inline validation).

## [0.1.0] — 2026-04-18

Initial preview release.

### Added

- **Custom editor** for MuJoCo `.xml` files, mounting a 3D viewer built on Threlte + Three.js + the official MuJoCo WASM build.
- **Multi-file model loading** — resolves `<include>` references, mesh / texture / HFIELD asset paths, and serves binaries through `webview.asWebviewUri`.
- **Live sync** — edits in the XML tab stream into the running simulation via `fileChanged` messages; MuJoCo compile errors surface as in-viewer toasts.
- **Panel-side editing** — drag transforms, recolor, re-parent from the scene tree. Saves apply via `WorkspaceEdit`, preserving undo history.
- **Commands** — `Open`, `Open to the Side`, `Reload`, `Reset Camera`, `Toggle Play`, `Reset Simulation`, `Take Screenshot`, `Open as Text`, `Reveal Model Folder`, `Show Output`.
- **Keybindings** — `Space` play/pause, `R` reset, `F` reset camera, `Cmd/Ctrl+Shift+R` reload (all scoped to viewer focus).
- **15 settings** under `mujoco-viewer.*` covering simulation, camera, rendering, editor behavior, panels, schema validation, screenshots, and developer logging.
- **Default-editor selector** — `mujoco-viewer.editor.defaultViewer` writes `workbench.editorAssociations` so users can make `.xml` (or `*.mjcf.xml`-only) open in the viewer by default.
- **Bundled XSD** — auto-registered with the Red Hat XML extension for `*.mjcf.xml` autocomplete and validation.
- **Log output channel** with configurable level.
