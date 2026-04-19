# MuJoCo Viewer for VS Code, Cursor & other VS Code-based IDEs

A live 3D viewer and editor for [MuJoCo](https://mujoco.org) MJCF models — runs in VS Code, Cursor, Windsurf, VSCodium, and any other IDE that speaks the VS Code extension API.

Open an MJCF `.xml` file and get a real-time physics simulation alongside your code. Edit attributes in the XML and watch the scene update. Click anything in the 3D view to inspect and tweak it, and have your changes flow back into the XML as undoable edits.

![MuJoCo Viewer](https://raw.githubusercontent.com/julien-blanchon/mujoco-viewer/main/apps/vscode-extension/assets/screenshot.png)

> **Preview release.** Feedback and bug reports welcome at [github.com/julien-blanchon/mujoco-viewer/issues](https://github.com/julien-blanchon/mujoco-viewer/issues).

## What it is

A workbench for iterating on MuJoCo robot models. The usual loop when writing MJCF is *edit XML → run a separate viewer → squint at a compile error → re-edit*. This extension collapses that into a single VS Code window: the XML and the running simulation sit side by side, and everything round-trips automatically.

## On the viewer side

- **Live physics** — the simulation runs in-panel. Play, pause, step, or reset. Physics is real MuJoCo (the official `mujoco-js` WASM build), not a visual approximation.
- **Full 3D navigation** — orbit with the mouse, WASD / arrow keys to fly, `F` to re-frame, right-click to pan. Tunable in settings.
- **Scene understanding** — a tree of bodies, joints, geoms, cameras, lights, materials, textures, tendons, actuators, sensors, and keyframes. Click anything to select and inspect.
- **Viewpoints** — jump to any MJCF-declared `<camera>`, or click "track body" to follow a moving part through the simulation.
- **Debug overlays** — contact points, contact forces, center-of-mass markers, inertia boxes, joint frames, tendon paths, perturbation arrows — all toggleable.
- **Screenshots** — save a PNG of the current frame with one command.

## On the editor side

- **Two-way editing** — type in the XML and the simulation re-compiles on the fly. Drag a gizmo on a body, change a value in the inspector, apply a keyframe — the XML is updated through `WorkspaceEdit`, so it's all undoable in the regular text editor.
- **Compile errors surfaced as toasts** — MuJoCo rejects a malformed edit and you see the exact message in the viewer. No context-switching to a terminal.
- **Multi-file models** — `<include>` graphs resolve transparently. Meshes (STL / OBJ / MSH), textures (PNG / HDR / custom builtins), and heightfields load from the workspace automatically.
- **Inspector edits** — change a body's position, swap a geom's material, re-arrange a keyframe, toggle a light — the inspector panel maps every field directly onto its attribute in the source XML.
- **Save semantics match VS Code** — the viewer marks documents dirty, `Cmd/Ctrl+S` persists, closing a dirty tab prompts. Nothing surprising.

## On the simulation side

- **Standard MuJoCo features** — constraints, contact dynamics, actuators, tendons, sensors, flexcomps, all work out of the box.
- **Keyframes** — MJCF `<keyframe>` entries appear in the tree; click to apply, edit fields in the inspector to modify.
- **Perturbation** — drag a body in the running simulation to apply a test force.
- **Fixed time step** — the viewer honours your MJCF's `<option timestep=…>`.

## Install

### VS Code

1. Open the Extensions view (`Cmd/Ctrl+Shift+X`) and search **MuJoCo Viewer**, or install from the [VS Code Marketplace page](https://marketplace.visualstudio.com/items?itemName=julienblanchon.mujoco-viewer).
2. Open any MJCF `.xml` file (anything with `<mujoco>` as the root element).
3. Run **MuJoCo: Open with MuJoCo Viewer** from the command palette, or click the viewer icon in the editor title bar.

### Cursor, Windsurf, VSCodium & other forks

These IDEs ship with the [Open VSX](https://open-vsx.org) gallery instead of the VS Code Marketplace. The extension is published on both, so the install steps are the same — just the source differs:

- **Cursor** — Extensions view → search *MuJoCo Viewer* (Cursor reads Open VSX by default).
- **Windsurf** — Extensions view → search *MuJoCo Viewer*.
- **VSCodium / Gitpod / code-server** — Extensions view → search *MuJoCo Viewer*, or install directly from the [Open VSX page](https://open-vsx.org/extension/julienblanchon/mujoco-viewer).

If your IDE can't find it in its built-in search, grab the `.vsix` from the [GitHub Releases](https://github.com/julien-blanchon/mujoco-viewer/releases) and install it via **Extensions → … → Install from VSIX…** — the same file works in every VS Code-based IDE.

Models included with MuJoCo (humanoid, cassie, shadow hand, etc.) all work out of the box.

## Make it open by default

You can have MuJoCo files open in the viewer automatically instead of the text editor. Set `mujoco-viewer.editor.defaultViewer`:

| Value        | Behaviour                                                                    |
| ------------ | ---------------------------------------------------------------------------- |
| `ask`        | VS Code shows the standard editor picker (default).                          |
| `viewer`     | Every `.xml` opens in the viewer.                                            |
| `text`       | Every `.xml` opens in the text editor (viewer is opt-in via the command).    |
| `mjcfOnly`   | Only `*.mjcf.xml` / `*.mujoco.xml` open in the viewer; other `.xml` as text. |

### Naming convention

The cleanest setup is to name your MuJoCo models **`humanoid.mjcf.xml`** or **`humanoid.mujoco.xml`**. With `mjcfOnly`, only those files open in the viewer by default — plain `.xml` keeps its normal behaviour — and the XSD schema registers for them automatically.

## Schema validation

If you install [**Red Hat XML**](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-xml) (free, widely-used) and name your files `*.mjcf.xml` or `*.mujoco.xml`, the MuJoCo schema auto-registers and you get in-editor autocomplete and validation — no `xsi:noNamespaceSchemaLocation` needed on your `<mujoco>` root.

**Element and attribute completion:**

![Attribute completion on `<geom>`](https://raw.githubusercontent.com/julien-blanchon/mujoco-viewer/main/apps/vscode-extension/assets/schema/example3.png)

**Enum completion on constrained attributes:**

![Enum completion on `<texture builtin="">`](https://raw.githubusercontent.com/julien-blanchon/mujoco-viewer/main/apps/vscode-extension/assets/schema/example1.png)

**Inline validation:**

![Validation errors on invalid `pos` / `dir`](https://raw.githubusercontent.com/julien-blanchon/mujoco-viewer/main/apps/vscode-extension/assets/schema/example2.png)

If you'd rather keep the plain `.xml` suffix, run **XML: Bind to Grammar/Schema File…** from the Red Hat XML command palette and point it at `https://raw.githubusercontent.com/julien-blanchon/mujoco-schema/main/mujoco_schema.xsd`.

Schema registration is on by default — turn it off via `mujoco-viewer.model.schemaValidation`.

## Commands

All commands are available from the Command Palette (`Cmd/Ctrl+Shift+P`). No default keybindings — the extension used to ship play/pause/reset bindings on `Space` / `R` / `F`, but those could steal keys from other VS Code panels, so they've been removed. Bind them yourself via **Preferences → Keyboard Shortcuts** if you miss them.

- `MuJoCo: Open with MuJoCo Viewer`
- `MuJoCo: Open with MuJoCo Viewer to the Side`
- `MuJoCo: Reload Model`
- `MuJoCo: Toggle Play / Pause`
- `MuJoCo: Reset Simulation`
- `MuJoCo: Reset Camera View`
- `MuJoCo: Save Screenshot…`
- `MuJoCo: Open as Text Editor`
- `MuJoCo: Reveal Model Folder in Explorer`
- `MuJoCo: Show Output Log`

## Settings

All settings live under `mujoco-viewer.*` and update live — no reload needed.

- **Simulation** — `autoPlay`, `pauseOnFileChange`
- **Camera** — `flySpeed`, `boostMultiplier`, `slowDivisor`, `invertY`
- **Rendering** — `shadows`, `showGrid`, `showSkybox`, `backgroundStyle`
- **Editor** — `openBehavior` (replace vs. side-by-side), `defaultViewer` (see above)
- **Panels** — `defaultCollapsed` (useful on small screens)
- **Model** — `schemaValidation` (gates the Red Hat XML registration above)
- **Screenshot** — `directory` (default save folder; blank = prompt each time)
- **Developer** — `logLevel` for the MuJoCo Viewer output channel

## Requirements

- VS Code 1.100+ (or Cursor, Windsurf, VSCodium, code-server, Gitpod — any IDE on the same extension API).
- **Optional:** [Red Hat XML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-xml) ([Open VSX mirror](https://open-vsx.org/extension/redhat/vscode-xml)) — only needed for in-editor MJCF autocomplete and validation. The viewer itself works without it.

## Privacy

No telemetry. The extension and all physics computation run locally — no network requests except for optional schema lookups when you explicitly reference a remote XSD.

## License

MIT. The bundled MuJoCo WASM is Apache-2.0 via [`mujoco-js`](https://www.npmjs.com/package/mujoco-js).

## Links

- **Source:** [github.com/julien-blanchon/mujoco-viewer](https://github.com/julien-blanchon/mujoco-viewer)
- **Issues:** [github.com/julien-blanchon/mujoco-viewer/issues](https://github.com/julien-blanchon/mujoco-viewer/issues)
- **MuJoCo:** [mujoco.org](https://mujoco.org) · [documentation](https://mujoco.readthedocs.io)
