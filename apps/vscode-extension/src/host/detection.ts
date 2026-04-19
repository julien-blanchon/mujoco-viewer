import * as vscode from "vscode";

/**
 * Quick heuristic: does this XML document look like a MuJoCo model file?
 *
 * We only peek at the first ~4KB so this stays cheap to run on every
 * editor-switch event. Checks for the `<mujoco>` root element (case-
 * sensitive — MuJoCo is strict).
 */
export function looksLikeMJCF(doc: vscode.TextDocument): boolean {
  if (doc.languageId !== "xml") return false;
  const head = doc.getText(
    new vscode.Range(0, 0, Math.min(60, doc.lineCount - 1), 0),
  );
  return /<mujoco(\s|>)/i.test(head);
}

/** Context key manager. Keeps `mujocoViewer.isMJCF` synced with the active
 *  editor so the `editor/title` icon can hide on non-MuJoCo XMLs. */
export function installActiveFileContextKey(
  context: vscode.ExtensionContext,
): void {
  const update = () => {
    const editor = vscode.window.activeTextEditor;
    const ok = editor ? looksLikeMJCF(editor.document) : false;
    void vscode.commands.executeCommand(
      "setContext",
      "mujocoViewer.isMJCF",
      ok,
    );
  };

  update();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) update();
    }),
    vscode.workspace.onDidCloseTextDocument(update),
  );
}
