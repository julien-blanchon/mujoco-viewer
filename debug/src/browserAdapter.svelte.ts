import {
  DEFAULT_VIEWER_SETTINGS,
  type HostAdapter,
  type LoadModelPayload,
  type LoadedFile,
  type ThemeKind,
  type ViewerSettings,
} from "@mujoco-viewer/protocol";

/**
 * Chrome / Edge / any browser exposing the File System Access API.
 * We feature-detect at runtime and fall back to drag-drop when absent.
 */
type DirHandle = FileSystemDirectoryHandle;

interface FileSystemDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}
interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}
interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}
interface FileSystemWritableFileStream {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<DirHandle>;
  }
}

export function fileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Creates an adapter backed by a chosen directory + root XML name. The caller
 * is responsible for presenting the folder-picker UI (via `pickRoot` below)
 * and handing in the results.
 */
export function createBrowserAdapter(options: {
  dir: DirHandle;
  rootPath: string;
}): HostAdapter {
  const { dir, rootPath } = options;
  const fileListeners = new Set<(path: string, content: string) => void>();
  let resolvedModel: LoadModelPayload | null = null;

  const theme: { current: ThemeKind } = $state({ current: "dark" });
  const settings: { current: ViewerSettings } = $state({
    current: DEFAULT_VIEWER_SETTINGS,
  });

  async function readAll(): Promise<LoadModelPayload> {
    if (resolvedModel) return resolvedModel;
    const files: LoadedFile[] = [];
    const visited = new Set<string>();
    const queue = [rootPath];

    while (queue.length > 0) {
      const rel = queue.shift()!;
      if (visited.has(rel)) continue;
      visited.add(rel);
      try {
        const bytes = await readFromHandle(dir, rel);
        if (!bytes) continue;
        const text = new TextDecoder().decode(bytes);
        files.push({ path: rel, content: text });
        scanIncludes(text, rel, visited, queue);
      } catch (e) {
        console.warn(`[browser-adapter] skipping ${rel}:`, e);
      }
    }

    resolvedModel = {
      rootPath,
      files,
      assetBaseUri: "about:blank/",
    };
    return resolvedModel;
  }

  return {
    async loadInitial(): Promise<LoadModelPayload> {
      return readAll();
    },
    onFileChanged(cb) {
      fileListeners.add(cb);
      return () => fileListeners.delete(cb);
    },
    async save(files) {
      for (const f of files) {
        await writeToHandle(dir, f.path, f.content);
      }
    },
    resolveAsset(path: string): string {
      // Not meaningful here — readAsset is used instead.
      return path;
    },
    async readAsset(path) {
      try {
        return await readFromHandle(dir, path);
      } catch {
        return null;
      }
    },
    theme,
    settings,
    reportError(message) {
      console.error("[browser-adapter]", message);
    },
    log(level, message) {
      console[level === "debug" ? "log" : level](
        "[mujoco-viewer]",
        message,
      );
    },
  };
}

async function readFromHandle(
  dir: DirHandle,
  relPath: string,
): Promise<Uint8Array | null> {
  const parts = relPath.split("/");
  let current: DirHandle = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

async function writeToHandle(
  dir: DirHandle,
  relPath: string,
  content: string,
): Promise<void> {
  const parts = relPath.split("/");
  let current: DirHandle = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

function scanIncludes(
  xml: string,
  currentFile: string,
  visited: Set<string>,
  queue: string[],
): void {
  const currentDir = currentFile.includes("/")
    ? currentFile.substring(0, currentFile.lastIndexOf("/") + 1)
    : "";
  const re = /<include\b[^>]*?\bfile\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const full = normalize(currentDir + m[1]);
    if (!visited.has(full)) queue.push(full);
  }
}

function normalize(p: string): string {
  const parts = p.replace(/\/\//g, "/").split("/");
  const out: string[] = [];
  for (const s of parts) {
    if (s === "..") out.pop();
    else if (s !== "." && s !== "") out.push(s);
  }
  return out.join("/");
}

/**
 * UI helper: prompt the user for a directory + a root XML file inside it.
 * Resolves with { dir, rootPath } or throws if the user cancels.
 */
export async function pickRoot(): Promise<{
  dir: DirHandle;
  rootPath: string;
}> {
  if (!window.showDirectoryPicker) {
    throw new Error(
      "File System Access API is not supported in this browser. Try Chrome/Edge, or use the drag-drop fallback.",
    );
  }
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });
  // Find an .xml file in the picked directory. If multiple, prefer one whose
  // name contains "scene", otherwise pick the first.
  const xmlCandidates: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file" && name.toLowerCase().endsWith(".xml")) {
      xmlCandidates.push(name);
    }
  }
  if (xmlCandidates.length === 0) {
    throw new Error(
      "No .xml file found in the selected directory. Pick a folder that contains a MuJoCo model.",
    );
  }
  const preferred =
    xmlCandidates.find((n) => /scene/i.test(n)) ?? xmlCandidates[0];
  return { dir, rootPath: preferred };
}
