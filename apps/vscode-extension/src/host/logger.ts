import * as vscode from "vscode";
import type { LogLevel } from "@mujoco-viewer/protocol";

/**
 * Central output channel for the extension. Uses VSCode's LogOutputChannel
 * API so user-facing level filtering just works (visible in `Output` →
 * `MuJoCo Viewer`, and respects the VSCode-wide log level).
 *
 * We additionally honour `mujoco-viewer.developer.logLevel` as a secondary
 * gate so users can silence the channel without touching VSCode's log level.
 */
let channel: vscode.LogOutputChannel | undefined;
let userLevel: LogLevel = "warn";

const LEVEL_RANK: Record<LogLevel, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function initLogger(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("MuJoCo Viewer", { log: true });
  context.subscriptions.push(channel);
}

export function setLogLevel(level: LogLevel): void {
  userLevel = level;
}

function allowed(level: LogLevel): boolean {
  if (userLevel === "off") return false;
  return LEVEL_RANK[level] <= LEVEL_RANK[userLevel];
}

export const log = {
  error(message: string, ...rest: unknown[]): void {
    if (!channel || !allowed("error")) return;
    channel.error(message, ...rest);
  },
  warn(message: string, ...rest: unknown[]): void {
    if (!channel || !allowed("warn")) return;
    channel.warn(message, ...rest);
  },
  info(message: string, ...rest: unknown[]): void {
    if (!channel || !allowed("info")) return;
    channel.info(message, ...rest);
  },
  debug(message: string, ...rest: unknown[]): void {
    if (!channel || !allowed("debug")) return;
    channel.debug(message, ...rest);
  },
  show(): void {
    channel?.show(true);
  },
};
