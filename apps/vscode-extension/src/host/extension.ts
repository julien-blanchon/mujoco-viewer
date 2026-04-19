import * as vscode from "vscode";
import type { DefaultViewer } from "@mujoco-viewer/protocol";
import { registerXmlSchema, unregisterXmlSchema } from "./xmlSchema";
import { attachViewerSession } from "./viewerSession";
import { initLogger, log, setLogLevel } from "./logger";
import { getSchemaValidationEnabled, isViewerConfigChange } from "./settings";
import { applyDefaultViewer } from "./editorAssociation";
import { installActiveFileContextKey } from "./detection";
import { dispatchCommand, getActiveSession } from "./sessionRegistry";

const VIEW_TYPE = "mujoco-viewer.editor";

export function activate(context: vscode.ExtensionContext): void {
  initLogger(context);
  setLogLevel(
    vscode.workspace
      .getConfiguration("mujoco-viewer")
      .get("developer.logLevel", "warn"),
  );
  log.info("MuJoCo Viewer activated");

  installActiveFileContextKey(context);

  // Schema + default editor are optional features gated by settings. We track
  // whether the schema is currently registered so we can flip it on/off live.
  let schemaRegistered = false;
  const syncSchemaRegistration = async () => {
    const want = getSchemaValidationEnabled();
    if (want && !schemaRegistered) {
      await registerXmlSchema(context).catch((e: unknown) => {
        log.warn(`Schema registration failed: ${String(e)}`);
      });
      schemaRegistered = true;
    } else if (!want && schemaRegistered) {
      unregisterXmlSchema();
      schemaRegistered = false;
    }
  };
  void syncSchemaRegistration();

  // Apply editor association once at activation so a fresh install matches
  // the user's preference without them touching settings again.
  const currentDefault = vscode.workspace
    .getConfiguration("mujoco-viewer")
    .get<DefaultViewer>("editor.defaultViewer", "ask");
  void applyDefaultViewer(currentDefault);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!isViewerConfigChange(e)) return;
      setLogLevel(
        vscode.workspace
          .getConfiguration("mujoco-viewer")
          .get("developer.logLevel", "warn"),
      );
      if (e.affectsConfiguration("mujoco-viewer.model.schemaValidation")) {
        await syncSchemaRegistration();
      }
      if (e.affectsConfiguration("mujoco-viewer.editor.defaultViewer")) {
        const choice = vscode.workspace
          .getConfiguration("mujoco-viewer")
          .get<DefaultViewer>("editor.defaultViewer", "ask");
        await applyDefaultViewer(choice);
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new MuJoCoEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  registerCommands(context);
}

function registerCommands(context: vscode.ExtensionContext): void {
  const resolveTarget = (uri?: vscode.Uri): vscode.Uri | undefined =>
    uri ?? vscode.window.activeTextEditor?.document.uri;

  const openWithViewType = async (
    uri: vscode.Uri | undefined,
    viewColumn: vscode.ViewColumn,
  ) => {
    const target = resolveTarget(uri);
    if (!target) {
      vscode.window.showWarningMessage(
        "MuJoCo Viewer: no XML file selected",
      );
      return;
    }
    await vscode.commands.executeCommand(
      "vscode.openWith",
      target,
      VIEW_TYPE,
      viewColumn,
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("mujoco-viewer.open", async (uri?: vscode.Uri) => {
      const behavior = vscode.workspace
        .getConfiguration("mujoco-viewer")
        .get<"replace" | "beside">("editor.openBehavior", "replace");
      const col =
        behavior === "beside"
          ? vscode.ViewColumn.Beside
          : vscode.ViewColumn.Active;
      await openWithViewType(uri, col);
    }),

    vscode.commands.registerCommand(
      "mujoco-viewer.openToSide",
      async (uri?: vscode.Uri) => openWithViewType(uri, vscode.ViewColumn.Beside),
    ),

    vscode.commands.registerCommand("mujoco-viewer.openTextEditor", async () => {
      const s = getActiveSession();
      if (!s) return;
      await vscode.commands.executeCommand(
        "vscode.openWith",
        s.rootUri,
        "default",
      );
    }),

    vscode.commands.registerCommand("mujoco-viewer.reload", async () => {
      const s = getActiveSession();
      if (!s) {
        vscode.window.showInformationMessage(
          "MuJoCo Viewer: no viewer tab focused",
        );
        return;
      }
      await s.reload();
    }),

    vscode.commands.registerCommand(
      "mujoco-viewer.revealModelFolder",
      async () => {
        const s = getActiveSession();
        if (!s) return;
        const folder = vscode.Uri.joinPath(s.rootUri, "..");
        await vscode.commands.executeCommand("revealInExplorer", folder);
      },
    ),

    vscode.commands.registerCommand("mujoco-viewer.resetCamera", () => {
      if (!dispatchCommand("resetCamera")) {
        vscode.window.showInformationMessage(
          "MuJoCo Viewer: no viewer focused",
        );
      }
    }),
    vscode.commands.registerCommand("mujoco-viewer.togglePlay", () => {
      dispatchCommand("togglePlay");
    }),
    vscode.commands.registerCommand("mujoco-viewer.resetSimulation", () => {
      dispatchCommand("resetSimulation");
    }),
    vscode.commands.registerCommand("mujoco-viewer.takeScreenshot", () => {
      if (!dispatchCommand("takeScreenshot")) {
        vscode.window.showInformationMessage(
          "MuJoCo Viewer: open a viewer tab first",
        );
      }
    }),

    vscode.commands.registerCommand("mujoco-viewer.showOutput", () => {
      log.show();
    }),
  );
}

class MuJoCoEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    attachViewerSession(this.context, webviewPanel, document.uri);
  }
}

export function deactivate(): void {
  // Cleanup happens via subscriptions.
}
