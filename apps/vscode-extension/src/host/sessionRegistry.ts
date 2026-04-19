import * as vscode from "vscode";
import type { HostToWebview, ViewerCommand } from "@mujoco-viewer/protocol";

/**
 * Registry of every currently-open viewer session. The CustomTextEditor
 * provider registers each session on creation and removes it on disposal.
 *
 * Used by:
 *   - Context keys (`mujocoViewer.active` / `mujocoViewer.focused`) so
 *     `editor/title` menus and keybindings only appear when a viewer tab
 *     exists / is focused.
 *   - Host-side commands (`reload`, `togglePlay`, `resetCamera`, …) that
 *     need to dispatch into the focused webview.
 */
export interface ViewerSession {
  readonly panel: vscode.WebviewPanel;
  readonly rootUri: vscode.Uri;
  postMessage(message: HostToWebview): void;
  reload(): Promise<void>;
  takeScreenshot(): Promise<void>;
}

const sessions = new Set<ViewerSession>();

function updateContextKeys(): void {
  const active = sessions.size > 0;
  const focused = Array.from(sessions).some((s) => s.panel.active);
  void vscode.commands.executeCommand(
    "setContext",
    "mujocoViewer.active",
    active,
  );
  void vscode.commands.executeCommand(
    "setContext",
    "mujocoViewer.focused",
    focused,
  );
}

export function registerSession(session: ViewerSession): vscode.Disposable {
  sessions.add(session);
  const focusSub = session.panel.onDidChangeViewState(updateContextKeys);
  updateContextKeys();
  return new vscode.Disposable(() => {
    focusSub.dispose();
    sessions.delete(session);
    updateContextKeys();
  });
}

/** The session whose panel is currently focused, falling back to any single
 *  open session (useful for keybinding-less command runs). Returns null if
 *  no viewer is open. */
export function getActiveSession(): ViewerSession | null {
  for (const s of sessions) if (s.panel.active) return s;
  if (sessions.size === 1) return sessions.values().next().value ?? null;
  return null;
}

export function forEachSession(cb: (s: ViewerSession) => void): void {
  for (const s of sessions) cb(s);
}

/** Dispatch a `command` message to the active webview, if any. */
export function dispatchCommand(command: ViewerCommand): boolean {
  const s = getActiveSession();
  if (!s) return false;
  s.postMessage({ type: "command", command });
  return true;
}
