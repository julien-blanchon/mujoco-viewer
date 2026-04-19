import * as vscode from "vscode";
import * as crypto from "node:crypto";

/**
 * (Re-)generate the webview HTML with fresh nonce and asset URIs.
 * Called on initial creation and on dev auto-reload.
 */
export function setWebviewHtml(
  panel: vscode.WebviewPanel,
  webviewDir: vscode.Uri,
  title = "MuJoCo Viewer",
): void {
  const webview = panel.webview;
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(webviewDir, "index.js"),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(webviewDir, "index.css"),
  );
  const nonce = crypto.randomBytes(16).toString("hex");

  // `unsafe-eval` + `wasm-unsafe-eval` are both needed — Emscripten's
  // mujoco-js module calls `new Function(...)` during bootstrap, which
  // `wasm-unsafe-eval` alone doesn't cover.
  // `blob:` in script-src lets Vite-emitted worker chunks load at runtime.
  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval' 'unsafe-eval' blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `img-src ${webview.cspSource} data: blob:`,
    `worker-src ${webview.cspSource} blob:`,
    `connect-src ${webview.cspSource} blob: data:`,
  ].join("; ");

  webview.html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
