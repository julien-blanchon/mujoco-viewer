import * as vscode from "vscode";
import {
  DEFAULT_VIEWER_SETTINGS,
  type BackgroundStyle,
  type DefaultViewer,
  type LogLevel,
  type OpenBehavior,
  type ViewerSettings,
} from "@mujoco-viewer/protocol";

/**
 * Read `mujoco-viewer.*` from the VSCode configuration and produce the
 * shape consumed by the webview adapter. Values missing from the workspace
 * / user config fall through to `DEFAULT_VIEWER_SETTINGS` (matches the
 * defaults declared in `contributes.configuration`).
 *
 * All reads go through `WorkspaceConfiguration.get<T>(key, default)` so the
 * user's preferences and the package defaults stay in lockstep — i.e. if a
 * user deletes the key from settings.json they get our canonical default,
 * not `undefined`.
 */
export function readViewerSettings(
  scope?: vscode.ConfigurationScope,
): ViewerSettings {
  const cfg = vscode.workspace.getConfiguration("mujoco-viewer", scope);
  const d = DEFAULT_VIEWER_SETTINGS;
  return {
    simulation: {
      autoPlay: cfg.get<boolean>("simulation.autoPlay", d.simulation.autoPlay),
      pauseOnFileChange: cfg.get<boolean>(
        "simulation.pauseOnFileChange",
        d.simulation.pauseOnFileChange,
      ),
    },
    camera: {
      flySpeed: cfg.get<number>("camera.flySpeed", d.camera.flySpeed),
      boostMultiplier: cfg.get<number>(
        "camera.boostMultiplier",
        d.camera.boostMultiplier,
      ),
      slowDivisor: cfg.get<number>("camera.slowDivisor", d.camera.slowDivisor),
      invertY: cfg.get<boolean>("camera.invertY", d.camera.invertY),
    },
    rendering: {
      shadows: cfg.get<boolean>("rendering.shadows", d.rendering.shadows),
      showGrid: cfg.get<boolean>("rendering.showGrid", d.rendering.showGrid),
      showSkybox: cfg.get<boolean>(
        "rendering.showSkybox",
        d.rendering.showSkybox,
      ),
      backgroundStyle: cfg.get<BackgroundStyle>(
        "rendering.backgroundStyle",
        d.rendering.backgroundStyle,
      ),
    },
    editor: {
      openBehavior: cfg.get<OpenBehavior>(
        "editor.openBehavior",
        d.editor.openBehavior,
      ),
      defaultViewer: cfg.get<DefaultViewer>(
        "editor.defaultViewer",
        d.editor.defaultViewer,
      ),
    },
    panels: {
      defaultCollapsed: cfg.get<boolean>(
        "panels.defaultCollapsed",
        d.panels.defaultCollapsed,
      ),
    },
    developer: {
      logLevel: cfg.get<LogLevel>(
        "developer.logLevel",
        d.developer.logLevel,
      ),
    },
  };
}

export function getLogLevel(): LogLevel {
  return vscode.workspace
    .getConfiguration("mujoco-viewer")
    .get<LogLevel>("developer.logLevel", DEFAULT_VIEWER_SETTINGS.developer.logLevel);
}

export function getOpenBehavior(
  scope?: vscode.ConfigurationScope,
): OpenBehavior {
  return vscode.workspace
    .getConfiguration("mujoco-viewer", scope)
    .get<OpenBehavior>(
      "editor.openBehavior",
      DEFAULT_VIEWER_SETTINGS.editor.openBehavior,
    );
}

export function getSchemaValidationEnabled(): boolean {
  return (
    vscode.workspace
      .getConfiguration("mujoco-viewer")
      .get<"on" | "off">("model.schemaValidation", "on") === "on"
  );
}

export function getScreenshotDirectory(): string {
  return vscode.workspace
    .getConfiguration("mujoco-viewer")
    .get<string>("screenshot.directory", "");
}

/** True if the setting change affects any `mujoco-viewer.*` key. */
export function isViewerConfigChange(
  e: vscode.ConfigurationChangeEvent,
  scope?: vscode.ConfigurationScope,
): boolean {
  return e.affectsConfiguration("mujoco-viewer", scope);
}
