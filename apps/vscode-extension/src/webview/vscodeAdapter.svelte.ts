import {
  DEFAULT_VIEWER_SETTINGS,
  type HostAdapter,
  type HostToWebview,
  type LoadModelPayload,
  type LoadedFile,
  type ThemeKind,
  type ViewerCommand,
  type ViewerSettings,
  type WebviewToHost,
} from "@mujoco-viewer/protocol";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): T;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode: VsCodeApi | undefined =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

function post(message: WebviewToHost): void {
  vscode?.postMessage(message);
}

function detectTheme(): ThemeKind {
  const body = document.body;
  if (body.classList.contains("vscode-light")) return "light";
  return "dark";
}

/**
 * HostAdapter implementation that speaks the VSCode webview message protocol.
 * Bridges `postMessage` / `onmessage` on one side and the
 * {@link HostAdapter} interface consumed by `<ViewerApp>` on the other.
 *
 * The returned object carries a `dispose()` method; the webview's lifetime
 * normally matches the JS context (the whole page goes away when the panel
 * closes), but exposing cleanup keeps the adapter test-friendly and documents
 * the ownership of the two DOM subscriptions below.
 */
export function createVSCodeAdapter(): HostAdapter & { dispose(): void } {
  const fileListeners = new Set<(path: string, content: string) => void>();
  const commandListeners = new Set<(command: ViewerCommand) => void>();
  let loadResolve: ((m: LoadModelPayload) => void) | null = null;
  let initialLoad: Promise<LoadModelPayload> | null = null;
  let currentAssetBase = "";

  const theme: { current: ThemeKind } = $state({ current: detectTheme() });
  const settings: { current: ViewerSettings } = $state({
    current: DEFAULT_VIEWER_SETTINGS,
  });

  const onMessage = (event: MessageEvent<HostToWebview>) => {
    const msg = event.data;
    switch (msg.type) {
      case "loadModel":
        currentAssetBase = msg.model.assetBaseUri;
        loadResolve?.(msg.model);
        loadResolve = null;
        break;
      case "fileChanged":
        for (const cb of fileListeners) cb(msg.path, msg.content);
        break;
      case "themeChanged":
        theme.current = msg.kind;
        break;
      case "settingsChanged":
        settings.current = msg.settings;
        break;
      case "command":
        for (const cb of commandListeners) cb(msg.command);
        break;
    }
  };
  window.addEventListener("message", onMessage);

  // VSCode sets .vscode-dark / .vscode-light on <body>. Observe mutations so
  // the canvas picks up theme flips without waiting for an explicit message.
  const mo = new MutationObserver(() => {
    const next = detectTheme();
    if (next !== theme.current) theme.current = next;
  });
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  return {
    loadInitial() {
      if (!initialLoad) {
        initialLoad = new Promise<LoadModelPayload>((resolve) => {
          loadResolve = resolve;
          post({ type: "ready" });
        });
      }
      return initialLoad;
    },
    onFileChanged(cb) {
      fileListeners.add(cb);
      return () => fileListeners.delete(cb);
    },
    onCommand(cb) {
      commandListeners.add(cb);
      return () => commandListeners.delete(cb);
    },
    async save(files: LoadedFile[]): Promise<void> {
      post({ type: "saveFiles", files });
    },
    resolveAsset(path: string): string {
      if (!currentAssetBase) return path;
      return currentAssetBase.endsWith("/")
        ? currentAssetBase + path
        : currentAssetBase + "/" + path;
    },
    theme,
    settings,
    openFile(path: string, line?: number, column?: number): void {
      post({ type: "openFile", path, line, column });
    },
    reportError(message: string): void {
      post({ type: "error", message });
    },
    log(level, message) {
      post({ type: "log", level, message });
    },
    onScreenshot(dataUrl, width, height) {
      post({ type: "screenshot", dataUrl, width, height });
    },
    dispose(): void {
      window.removeEventListener("message", onMessage);
      mo.disconnect();
      fileListeners.clear();
      commandListeners.clear();
    },
  };
}
