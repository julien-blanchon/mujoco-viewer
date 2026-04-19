import * as vscode from "vscode";
import { setWebviewHtml } from "./webviewPanel";
import { setupDocumentSync } from "./documentSync";
import { setupDevReload } from "./devReload";
import { loadModel } from "./modelLoader";
import { applyEdits } from "./saveHandler";
import { readViewerSettings, isViewerConfigChange } from "./settings";
import { registerSession, type ViewerSession } from "./sessionRegistry";
import { saveScreenshot } from "./screenshot";
import { log } from "./logger";
import type {
  HostToWebview,
  WebviewToHost,
} from "@mujoco-viewer/protocol";
import * as path from "node:path";

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Wire up a webview panel to the MuJoCo viewer: configure CSP/html, stream the
 * resolved model on "ready", route save requests back to disk, forward editor
 * edits, and install dev-reload if applicable.
 */
export function attachViewerSession(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  rootUri: vscode.Uri,
): vscode.Disposable {
  const webviewDir = vscode.Uri.file(
    path.join(context.extensionPath, "dist", "webview"),
  );
  const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map(
    (f) => f.uri,
  );
  const rootDir = vscode.Uri.joinPath(rootUri, "..");
  panel.webview.options = {
    enableScripts: true,
    // Include the model's root directory so `asWebviewUri` can serve mesh /
    // texture assets that live alongside the XML.
    localResourceRoots: [webviewDir, rootDir, ...workspaceRoots],
  };
  panel.iconPath = {
    light: vscode.Uri.file(
      path.join(context.extensionPath, "resources", "icon-light.svg"),
    ),
    dark: vscode.Uri.file(
      path.join(context.extensionPath, "resources", "icon-dark.svg"),
    ),
  };
  setWebviewHtml(panel, webviewDir, panel.title);

  const trackedPaths = new Set<string>();

  const pushModel = async () => {
    try {
      const model = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `MuJoCo Viewer: loading ${path.basename(rootUri.fsPath)}`,
        },
        async (_progress, token) => loadModel(rootUri, panel.webview, token),
      );
      trackedPaths.clear();
      for (const f of model.files) trackedPaths.add(f.path);
      panel.webview.postMessage({ type: "loadModel", model } satisfies HostToWebview);
      log.info(`Loaded model ${model.rootPath} (${model.files.length} files)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Model load failed: ${msg}`);
      vscode.window.showErrorMessage(`MuJoCo Viewer: ${msg}`);
    }
  };

  const pushSettings = () => {
    panel.webview.postMessage({
      type: "settingsChanged",
      settings: readViewerSettings(rootUri),
    } satisfies HostToWebview);
  };

  // Multiple screenshot requests can be in-flight if the user mashes the
  // command; queue resolvers FIFO so each `takeScreenshot` promise settles
  // against a distinct webview reply.
  const pendingScreenshotResolvers: Array<(ok: boolean) => void> = [];

  const handleMessage = async (message: WebviewToHost) => {
    switch (message.type) {
      case "ready":
        pushSettings();
        await pushModel();
        break;
      case "saveFiles":
        try {
          await applyEdits(rootUri, message.files);
          log.debug(`Saved ${message.files.length} file(s)`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.error(`Save failed: ${msg}`);
          vscode.window.showErrorMessage(
            `MuJoCo Viewer: apply failed — ${msg}`,
          );
        }
        break;
      case "openFile":
        await revealFile(rootUri, message.path, message.line, message.column);
        break;
      case "screenshot": {
        let ok = false;
        try {
          await saveScreenshot(message.dataUrl, rootUri);
          ok = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.error(`Screenshot save failed: ${msg}`);
          vscode.window.showErrorMessage(`MuJoCo Viewer: ${msg}`);
        }
        pendingScreenshotResolvers.shift()?.(ok);
        break;
      }
      case "log":
        log[message.level](message.message);
        break;
      case "error":
        log.error(message.message);
        vscode.window.showErrorMessage(`MuJoCo Viewer: ${message.message}`);
        break;
    }
  };

  const messageDisposable = panel.webview.onDidReceiveMessage(handleMessage);
  const syncDisposable = setupDocumentSync(
    rootUri,
    trackedPaths,
    panel.webview,
  );
  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!isViewerConfigChange(e, rootUri)) return;
    pushSettings();
  });
  const devReloadDisposable = IS_DEV
    ? setupDevReload(context, panel)
    : new vscode.Disposable(() => {});

  const session: ViewerSession = {
    panel,
    rootUri,
    postMessage(message) {
      panel.webview.postMessage(message);
    },
    async reload() {
      await pushModel();
    },
    takeScreenshot(): Promise<void> {
      return new Promise<void>((resolve) => {
        pendingScreenshotResolvers.push(() => resolve());
        panel.webview.postMessage({
          type: "command",
          command: "takeScreenshot",
        } satisfies HostToWebview);
      });
    },
  };
  const registryDisposable = registerSession(session);

  const all = new vscode.Disposable(() => {
    messageDisposable.dispose();
    syncDisposable.dispose();
    configDisposable.dispose();
    devReloadDisposable.dispose();
    registryDisposable.dispose();
    while (pendingScreenshotResolvers.length) {
      pendingScreenshotResolvers.shift()?.(false);
    }
  });
  panel.onDidDispose(() => all.dispose());
  return all;
}

async function revealFile(
  rootUri: vscode.Uri,
  relPath: string,
  line?: number,
  column?: number,
): Promise<void> {
  try {
    const rootDir = vscode.Uri.joinPath(rootUri, "..");
    const target = vscode.Uri.joinPath(rootDir, relPath);
    const doc = await vscode.workspace.openTextDocument(target);
    const zeroBasedLine = Math.max(0, (line ?? 1) - 1);
    const zeroBasedCol = Math.max(0, (column ?? 1) - 1);
    const pos = new vscode.Position(zeroBasedLine, zeroBasedCol);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
      selection: new vscode.Range(pos, pos),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Could not open ${relPath}: ${msg}`);
    vscode.window.showWarningMessage(
      `MuJoCo Viewer: could not open ${relPath} — ${msg}`,
    );
  }
}
