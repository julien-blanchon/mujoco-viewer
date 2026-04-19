/**
 * Messages exchanged between the VSCode extension host and the webview.
 *
 * Wire format: JSON-serializable objects passed through VSCode's
 * `webview.postMessage` (host → webview) and `postMessage` from the
 * injected `acquireVsCodeApi()` handle (webview → host).
 *
 * The debug web app uses the same shape but bridges it over a plain
 * `window.postMessage` + direct in-process calls.
 */

import type { ViewerSettings } from "./settings.js";

/** A single file the webview can read (XML text). Binary assets (meshes,
 *  textures) are served via `assetBaseUri` + `asWebviewUri` instead of being
 *  ferried inline. */
export interface LoadedFile {
  /** Path relative to the model root dir, using forward slashes. */
  path: string;
  /** UTF-8 text content. */
  content: string;
}

export interface LoadModelPayload {
  /** Path of the root XML file, relative to the model root dir. */
  rootPath: string;
  /** Text content of every XML/include file discovered for this model. */
  files: LoadedFile[];
  /** Base URI that the webview should use to fetch binary assets. In the
   *  VSCode host this is produced by `webview.asWebviewUri(rootDir)`. */
  assetBaseUri: string;
}

export type ThemeKind = "light" | "dark";

/** Host → Webview messages. */
export type HostToWebview =
  | { type: "loadModel"; model: LoadModelPayload }
  | { type: "fileChanged"; path: string; content: string }
  | { type: "themeChanged"; kind: ThemeKind }
  | { type: "settingsChanged"; settings: ViewerSettings }
  | { type: "command"; command: ViewerCommand };

/** Host-initiated commands the webview reacts to. Driven from keybindings
 *  or menu entries on the host side. */
export type ViewerCommand =
  | "resetCamera"
  | "togglePlay"
  | "resetSimulation"
  | "takeScreenshot";

/** Webview → Host messages. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "saveFiles"; files: LoadedFile[] }
  | { type: "openFile"; path: string; line?: number; column?: number }
  | { type: "error"; message: string }
  | { type: "log"; level: "error" | "warn" | "info" | "debug"; message: string }
  | { type: "screenshot"; dataUrl: string; width: number; height: number };

/** Discriminant helper for exhaustive switches. */
export type MessageType<
  T extends { type: string },
  K extends T["type"],
> = Extract<T, { type: K }>;
