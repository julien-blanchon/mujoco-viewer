import type {
  LoadedFile,
  LoadModelPayload,
  ThemeKind,
  ViewerCommand,
} from "./messages.js";
import type { ViewerSettings } from "./settings.js";

/**
 * The host-platform contract consumed by the viewer UI. Every platform-
 * specific concern (VSCode message bus, browser File System Access API,
 * test fixture) provides its own implementation.
 *
 * The viewer UI sees only this interface via Svelte context — it never
 * imports platform APIs directly.
 */
export interface HostAdapter {
  /** Resolve the initial model. Called once at startup; the returned promise
   *  settles when the host has the files ready. */
  loadInitial(): Promise<LoadModelPayload>;

  /** Subscribe to out-of-band model edits coming from the host (e.g. the user
   *  typed in the VSCode editor). Returns a disposer. */
  onFileChanged(cb: (path: string, content: string) => void): () => void;

  /** Persist modified XML files back to whatever storage the host owns. */
  save(files: LoadedFile[]): Promise<void>;

  /** Turn a model-relative asset path (e.g. `"meshes/body.stl"`) into a URL
   *  the webview can `fetch()`. */
  resolveAsset(path: string): string;

  /** Optional: read a binary asset directly (returns raw bytes). The viewer
   *  consults this before falling back to an HTTP fetch against
   *  `resolveAsset(path)`. Implemented by hosts that have the bytes on hand
   *  (e.g. the File System Access API in the debug web app) but don't have a
   *  stable URL for them. Return `null` to fall through to HTTP. */
  readAsset?(path: string): Promise<Uint8Array | null>;

  /** Current theme; updated reactively by the host. */
  readonly theme: { current: ThemeKind };

  /** Current user settings; updated reactively by the host whenever the user
   *  changes a `mujoco-viewer.*` preference. The UI treats the value as
   *  immutable — it re-reads `.current` on every $derived / $effect. */
  readonly settings: { current: ViewerSettings };

  /** Subscribe to host-initiated commands (e.g. a VSCode keybinding or
   *  command-palette entry that the webview should react to). Returns a
   *  disposer. Optional — debug shells that don't drive the viewer from
   *  outside can omit it. */
  onCommand?(cb: (command: ViewerCommand) => void): () => void;

  /** Optional: prompt the user to pick a different model. Available in the
   *  debug web app (native file picker); not in the VSCode host (the editor
   *  already owns file selection — users re-run `mujoco-viewer.open` instead). */
  pickModel?(): Promise<LoadModelPayload | null>;

  /** Optional: reveal a model file in the host's editor, optionally at a
   *  specific line. Used by inspector source-location links to jump from a
   *  selected entity to its XML definition. `path` is model-relative (same
   *  key space as `LoadModelPayload.files`). Lines are 1-based. */
  openFile?(path: string, line?: number, column?: number): void;

  /** Optional: report a non-fatal error to the host (surfaces as a toast in
   *  VSCode, console in the debug app). */
  reportError?(message: string): void;

  /** Optional: structured log sink. Routed to the host's output channel /
   *  devtools. Prefer this over `console.*` so users can filter by level. */
  log?(
    level: "error" | "warn" | "info" | "debug",
    message: string,
  ): void;

  /** Optional: handle a screenshot captured by the viewer. Used by the
   *  `mujoco-viewer.takeScreenshot` command to save the image to disk. */
  onScreenshot?(dataUrl: string, width: number, height: number): void;
}
