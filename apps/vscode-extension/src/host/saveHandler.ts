import * as vscode from "vscode";
import type { LoadedFile } from "@mujoco-viewer/protocol";
import { resolveInRoot } from "./modelLoader";

/**
 * Apply the webview's modified XML back to their underlying TextDocuments.
 *
 * We deliberately do NOT call `doc.save()` afterwards. `applyEdit` marks the
 * documents as dirty — VSCode renders the modified-file chip on the tab,
 * Ctrl+S persists to disk, closing an unsaved tab prompts the user. This
 * gives us native VSCode semantics for free.
 *
 * Files that aren't already open are loaded via `openTextDocument` so the
 * edit still lands in an editor buffer (the user can then see / save them).
 */
export async function applyEdits(
  rootUri: vscode.Uri,
  files: LoadedFile[],
): Promise<void> {
  if (files.length === 0) return;

  const edit = new vscode.WorkspaceEdit();
  for (const file of files) {
    const target = resolveInRoot(rootUri, file.path);
    // `openTextDocument` is a no-op if the doc is already loaded, and reuses
    // the existing text buffer so this plays nicely with user edits in
    // progress. It returns a TextDocument whose range we can replace.
    const doc = await vscode.workspace.openTextDocument(target);
    if (doc.getText() === file.content) continue;
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length),
    );
    edit.replace(target, fullRange, file.content);
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}
