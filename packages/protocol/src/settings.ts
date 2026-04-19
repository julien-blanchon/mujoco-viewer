/**
 * Settings contract shared between the host (VSCode extension, browser debug
 * shell, etc.) and the viewer UI.
 *
 * The host owns the source of truth (e.g. `workspace.getConfiguration` in
 * VSCode, localStorage in the browser) and pushes a snapshot through the
 * `settingsChanged` message whenever the user changes one. The UI consumes
 * a single immutable `ViewerSettings` value via `adapter.settings.current`.
 *
 * Keep this file dependency-free and JSON-serialisable so it can travel
 * across the `postMessage` boundary unchanged.
 */

/** Where newly-opened viewer tabs should land. `replace` is Netron-style. */
export type OpenBehavior = "replace" | "beside";

/** Default action when double-clicking a `.xml` that could be MuJoCo.
 *  `mjcfOnly` narrows the viewer association to `*.mjcf.xml` /
 *  `*.mujoco.xml` filenames while leaving generic `*.xml` untouched. */
export type DefaultViewer = "ask" | "viewer" | "text" | "mjcfOnly";

/** Background rendering. `vscode` blends with the editor theme. */
export type BackgroundStyle = "vscode" | "skybox" | "solid";

/** Console log verbosity. Matches VSCode's LogLevel for easy mapping. */
export type LogLevel = "off" | "error" | "warn" | "info" | "debug";

export interface ViewerSimulationSettings {
  /** Start physics stepping as soon as the model loads. */
  autoPlay: boolean;
  /** Pause simulation automatically when the underlying XML changes. */
  pauseOnFileChange: boolean;
}

export interface ViewerCameraSettings {
  /** Base WASD/arrow fly speed, in scene-radii per second. */
  flySpeed: number;
  /** Multiplier applied while Shift is held. */
  boostMultiplier: number;
  /** Divisor applied while Alt or Ctrl is held. */
  slowDivisor: number;
  /** Flip the Y axis so forward motion matches "nose down" expectations. */
  invertY: boolean;
}

export interface ViewerRenderingSettings {
  shadows: boolean;
  showGrid: boolean;
  showSkybox: boolean;
  backgroundStyle: BackgroundStyle;
}

export interface ViewerEditorSettings {
  /** How the viewer tab relates to the text editor tab when opened. */
  openBehavior: OpenBehavior;
  /** What happens on a plain double-click in the explorer. */
  defaultViewer: DefaultViewer;
}

export interface ViewerPanelsSettings {
  defaultCollapsed: boolean;
}

export interface ViewerDeveloperSettings {
  logLevel: LogLevel;
}

export interface ViewerSettings {
  simulation: ViewerSimulationSettings;
  camera: ViewerCameraSettings;
  rendering: ViewerRenderingSettings;
  editor: ViewerEditorSettings;
  panels: ViewerPanelsSettings;
  developer: ViewerDeveloperSettings;
}

/** Canonical defaults — used by the browser debug shell and as the fallback
 *  when a VSCode user has never touched a given key. Keep in sync with the
 *  `contributes.configuration` block in the extension's `package.json`. */
export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  simulation: {
    autoPlay: false,
    pauseOnFileChange: true,
  },
  camera: {
    flySpeed: 0.6,
    boostMultiplier: 4,
    slowDivisor: 3,
    invertY: false,
  },
  rendering: {
    shadows: true,
    showGrid: true,
    showSkybox: true,
    backgroundStyle: "skybox",
  },
  editor: {
    openBehavior: "replace",
    defaultViewer: "ask",
  },
  panels: {
    defaultCollapsed: false,
  },
  developer: {
    logLevel: "warn",
  },
};
