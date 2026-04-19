#!/usr/bin/env node
// Build + launch the Extension Development Host.
// Tries `cursor` then `code` then `code-insiders`, so whatever the user has
// installed takes over. Opens the repo's `debug/fixtures` directory as a
// workspace so every MuJoCo example (humanoid, cassie, shadow-hand, ...) is
// one click away, then pre-opens the humanoid scene XML.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(__dirname, "..");
const fixturesDir = path.resolve(extPath, "../../debug/fixtures");
const initialFile = path.resolve(fixturesDir, "humanoid/humanoid.mjcf.xml");

const args = [
  `--extensionDevelopmentPath=${extPath}`,
  // Open the fixtures folder as the workspace root. Subdirectories (arm26,
  // cassie, shadow-hand, ...) show up in the explorer so we can exercise
  // multi-file `<include>` scenes.
  fixturesDir,
  // Open one XML by default so the viewer has something to render on launch.
  initialFile,
];

const candidates = ["cursor", "code", "code-insiders"];
for (const bin of candidates) {
  const result = spawnSync(bin, args, { stdio: "inherit" });
  if (result.error?.code !== "ENOENT") {
    process.exit(result.status ?? 0);
  }
}

console.error(
  "No VSCode-family CLI found. Install one of `cursor`, `code`, or `code-insiders` on PATH, or press F5 from inside VSCode on this workspace.",
);
process.exit(1);
