import * as vscode from "vscode";
import * as path from "node:path";
import { setWebviewHtml } from "./webviewPanel";

/**
 * In development, watch `build/webview/` for changes and auto-reload
 * the webview panel. This gives near-instant feedback when editing
 * Svelte components — Vite rebuilds (~200ms), then this triggers
 * a full webview HTML refresh.
 */
export function setupDevReload(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
): vscode.Disposable {
  const webviewDir = vscode.Uri.file(
    path.join(context.extensionPath, "dist", "webview"),
  );

  const pattern = new vscode.RelativePattern(webviewDir, "**/*");
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  // Debounce: Vite writes index.js and index.css in quick succession
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const reload = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      setWebviewHtml(panel, webviewDir);
    }, 100);
  };

  watcher.onDidChange(reload);
  watcher.onDidCreate(reload);

  return new vscode.Disposable(() => {
    clearTimeout(timeout);
    watcher.dispose();
  });
}
