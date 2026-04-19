import * as vscode from "vscode";
import type { DefaultViewer } from "@mujoco-viewer/protocol";
import { log } from "./logger";

const ASSOC_KEY = "workbench.editorAssociations";
const VIEW_TYPE = "mujoco-viewer.editor";
const TEXT_VIEW = "default";

/** Filename patterns we manage. Plain `*.xml` only gets touched by the
 *  all-or-nothing `viewer` / `text` choices; the double-extension patterns
 *  are the MJCF-specific ones and are always targeted by `mjcfOnly`. */
const MJCF_PATTERNS = ["*.mjcf.xml", "*.mujoco.xml"] as const;
const MANAGED_PATTERNS = ["*.xml", ...MJCF_PATTERNS] as const;

/**
 * Keep `workbench.editorAssociations` in sync with the user's
 * `mujoco-viewer.editor.defaultViewer` choice. We own the patterns in
 * {@link MANAGED_PATTERNS} but leave any other entries untouched, so a user
 * who hand-configured associations for some other extension won't see them
 * disappear when they flip our setting.
 */
export async function applyDefaultViewer(
  choice: DefaultViewer,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration();
  const current =
    cfg.get<Record<string, string>>(ASSOC_KEY, {}) ?? {};
  const next = { ...current };

  switch (choice) {
    case "ask":
      for (const p of MANAGED_PATTERNS) delete next[p];
      break;
    case "viewer":
      for (const p of MANAGED_PATTERNS) next[p] = VIEW_TYPE;
      break;
    case "text":
      for (const p of MANAGED_PATTERNS) next[p] = TEXT_VIEW;
      break;
    case "mjcfOnly":
      delete next["*.xml"];
      for (const p of MJCF_PATTERNS) next[p] = VIEW_TYPE;
      break;
  }

  // Skip the write if nothing changed — avoids polluting user settings with
  // unnecessary writes (and avoids a settings-reload loop).
  if (JSON.stringify(current) === JSON.stringify(next)) return;

  try {
    await cfg.update(
      ASSOC_KEY,
      Object.keys(next).length === 0 ? undefined : next,
      vscode.ConfigurationTarget.Global,
    );
    log.info(`Applied editor association: ${choice}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Could not update editor associations: ${msg}`);
  }
}
