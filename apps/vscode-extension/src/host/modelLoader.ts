import * as vscode from "vscode";
import * as path from "node:path";
import type { LoadModelPayload, LoadedFile } from "@mujoco-viewer/protocol";

/**
 * Walk a MuJoCo scene starting from `rootUri`, collecting every XML file the
 * webview's viewer-ui needs inlined (the root + transitive `<include>`s +
 * include-chain XMLs). Binary assets (meshes, textures) are *not* inlined —
 * the webview fetches those through `asWebviewUri(rootDir)` + relative paths.
 *
 * Mirrors the dependency-scan regex used in mujoco-svelte's `SceneLoader.ts`
 * so include/asset resolution stays consistent between what the host expects
 * to be editable and what the viewer actually loads.
 */
export async function loadModel(
  rootUri: vscode.Uri,
  webview: vscode.Webview,
  token?: vscode.CancellationToken,
): Promise<LoadModelPayload> {
  const rootDirFs = path.dirname(rootUri.fsPath);
  const rootDirUri = vscode.Uri.file(rootDirFs);
  const rootName = toPosix(path.basename(rootUri.fsPath));

  const visited = new Set<string>();
  const files: LoadedFile[] = [];
  const queue: string[] = [rootName];

  while (queue.length > 0) {
    if (token?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }
    const rel = queue.shift()!;
    if (visited.has(rel)) continue;
    visited.add(rel);

    const fileUri = vscode.Uri.joinPath(rootDirUri, ...rel.split("/"));
    let content: string;
    try {
      // Prefer the live editor buffer so unsaved edits propagate without a
      // disk round-trip. Falls back to the file on disk for includes that
      // aren't currently open.
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === fileUri.fsPath,
      );
      if (openDoc) {
        content = openDoc.getText();
      } else {
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        content = new TextDecoder().decode(bytes);
      }
    } catch {
      // Silently skip unreachable includes; `<include file="optional.xml"/>`
      // references are best-effort.
      continue;
    }

    files.push({ path: rel, content });
    scanIncludes(content, rel, visited, queue);
  }

  return {
    rootPath: rootName,
    files,
    assetBaseUri: webview.asWebviewUri(rootDirUri).toString(),
  };
}

/**
 * Regex-based scan for `<include file="..."/>`. Matches the approach in
 * `packages/mujoco-svelte/src/lib/core/SceneLoader.ts` `scanDependencies`.
 */
function scanIncludes(
  xml: string,
  currentFile: string,
  visited: Set<string>,
  queue: string[],
): void {
  const currentDir = currentFile.includes("/")
    ? currentFile.substring(0, currentFile.lastIndexOf("/") + 1)
    : "";

  const re = /<include\b[^>]*?\bfile\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const full = normalize(currentDir + m[1]);
    if (!visited.has(full)) queue.push(full);
  }
}

function normalize(p: string): string {
  const parts = p.replace(/\/\//g, "/").split("/");
  const out: string[] = [];
  for (const s of parts) {
    if (s === "..") out.pop();
    else if (s !== "." && s !== "") out.push(s);
  }
  return out.join("/");
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Resolve a model-relative path back to a workspace `Uri` for save. */
export function resolveInRoot(
  rootUri: vscode.Uri,
  relPath: string,
): vscode.Uri {
  const rootDir = vscode.Uri.file(path.dirname(rootUri.fsPath));
  return vscode.Uri.joinPath(rootDir, ...relPath.split("/"));
}
