import type { PluginBrowserBbSdk, PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";

interface HostFile {
  hostId?: string;
  path: string;
  rootPath?: string;
}

const join = (root: string, relative: string) =>
  `${root.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;

// Opener paths are relative to the worktree or thread storage; files.read wants the host path.
async function locate(
  sdk: PluginBrowserBbSdk,
  path: string,
  source: PluginFileOpenerSource,
  signal: AbortSignal,
): Promise<HostFile> {
  switch (source.kind) {
    case "host": {
      if (source.experimental_hostId !== undefined) return { hostId: source.experimental_hostId, path };
      if (source.environmentId === null) return { path };
      const environment = await sdk.environments.get({ environmentId: source.environmentId, signal });
      return { hostId: environment.hostId, path };
    }
    case "workspace": {
      if (source.environmentId === null) throw new Error("workspace file without an environment");
      const environment = await sdk.environments.get({ environmentId: source.environmentId, signal });
      if (environment.path === null) throw new Error("environment has no worktree");
      return {
        hostId: source.experimental_hostId ?? environment.hostId,
        path: join(environment.path, path),
        rootPath: environment.path,
      };
    }
    case "thread-storage": {
      if (source.threadId === null) throw new Error("thread-storage file without a thread");
      const storage = await sdk.threads.storageLocation({ threadId: source.threadId, signal });
      return {
        hostId: storage.hostId,
        path: join(storage.storageRootPath, path),
        rootPath: storage.storageRootPath,
      };
    }
  }
}

export interface FileText {
  text: string;
  sha256: string;
}

export async function readFileText(
  sdk: PluginBrowserBbSdk,
  path: string,
  source: PluginFileOpenerSource,
  signal: AbortSignal,
): Promise<FileText> {
  const file = await sdk.files.read({ ...(await locate(sdk, path, source, signal)), signal });
  const text =
    file.contentEncoding === "utf8"
      ? file.content
      : new TextDecoder().decode(Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0)));
  return { text, sha256: file.sha256 };
}
