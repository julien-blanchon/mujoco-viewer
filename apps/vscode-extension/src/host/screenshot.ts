import * as vscode from "vscode";
import * as path from "node:path";
import { getScreenshotDirectory } from "./settings";
import { log } from "./logger";

/**
 * Persist a webview-side screenshot (data-URL PNG) to disk. Chooses the
 * destination in this order:
 *   1. A folder set via `mujoco-viewer.screenshot.directory` (prompts only
 *      for the filename).
 *   2. The active document's folder.
 *   3. A native save dialog.
 *
 * Filename defaults to `<modelName>-<timestamp>.png` so rapid captures
 * don't overwrite each other.
 */
export async function saveScreenshot(
  dataUrl: string,
  rootUri: vscode.Uri,
): Promise<void> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    log.error("Screenshot payload was not a valid PNG data URL");
    return;
  }
  const bytes = Buffer.from(match[1], "base64");
  const modelName = path.basename(rootUri.fsPath, path.extname(rootUri.fsPath));
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const defaultName = `${modelName}-${ts}.png`;

  const configuredDir = getScreenshotDirectory().trim();
  let target: vscode.Uri | undefined;

  if (configuredDir) {
    const resolved = path.isAbsolute(configuredDir)
      ? configuredDir
      : path.join(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
            path.dirname(rootUri.fsPath),
          configuredDir,
        );
    target = vscode.Uri.file(path.join(resolved, defaultName));
  } else {
    const defaultUri = vscode.Uri.file(
      path.join(path.dirname(rootUri.fsPath), defaultName),
    );
    target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { "PNG Image": ["png"] },
      saveLabel: "Save Screenshot",
      title: "Save MuJoCo Viewer Screenshot",
    });
  }

  if (!target) return;

  try {
    await vscode.workspace.fs.writeFile(target, bytes);
    log.info(`Saved screenshot to ${target.fsPath}`);
    const action = await vscode.window.showInformationMessage(
      `Screenshot saved: ${path.basename(target.fsPath)}`,
      "Reveal",
    );
    if (action === "Reveal") {
      await vscode.commands.executeCommand("revealFileInOS", target);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Failed to save screenshot: ${msg}`);
    vscode.window.showErrorMessage(`MuJoCo Viewer: ${msg}`);
  }
}
