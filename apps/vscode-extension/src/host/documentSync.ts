import * as vscode from "vscode";
import * as path from "node:path";
import type { HostToWebview } from "@mujoco-viewer/protocol";

const DEBOUNCE_MS = 50;

/**
 * Watch every file in the loaded model and forward edits to the webview as
 * `fileChanged` messages. Used for live editor → 3D-view sync, including edits
 * to `<include>`d files.
 *
 * Per-file trailing debounce keeps the webview from re-parsing on every
 * keystroke in a burst — the MuJoCo compiler is not free, especially for
 * large scenes.
 */
export function setupDocumentSync(
  rootUri: vscode.Uri,
  trackedPaths: Set<string>,
  webview: vscode.Webview,
): vscode.Disposable {
  const rootDir = path.dirname(rootUri.fsPath);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const flush = (relPosix: string, content: string) => {
    const msg: HostToWebview = {
      type: "fileChanged",
      path: relPosix,
      content,
    };
    webview.postMessage(msg);
  };

  const sub = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.contentChanges.length === 0) return;
    const relFs = path.relative(rootDir, event.document.uri.fsPath);
    if (relFs.startsWith("..")) return;
    const relPosix = relFs.split(path.sep).join("/");
    if (!trackedPaths.has(relPosix)) return;

    const existing = timers.get(relPosix);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      timers.delete(relPosix);
      flush(relPosix, event.document.getText());
    }, DEBOUNCE_MS);
    timers.set(relPosix, handle);
  });

  return new vscode.Disposable(() => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    sub.dispose();
  });
}
