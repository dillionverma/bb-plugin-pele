import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { REFRESH_MS } from "./mermaid-file";

const FLOWCHART = "flowchart LR\n  A[Start] --> B[Done]";
const SEQUENCE = "sequenceDiagram\n  A->>B: hi";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Element.prototype.setPointerCapture = () => {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const app = await loadPluginApp(() => import("./app"));
const opener = app.fileOpeners[0]!;

function Original() {
  return <pre data-testid="original">bb preview</pre>;
}

interface Read {
  hostId?: string;
  path: string;
  rootPath?: string;
}

function openFile({
  path = "docs/flow.mmd",
  source = { kind: "workspace", threadId: "thr_1", environmentId: "env_1", projectId: "proj_1" },
  files = { [`/work/repo/docs/flow.mmd`]: FLOWCHART } as Record<string, string | Error>,
  encoding = "utf8" as "utf8" | "base64",
}: {
  path?: string;
  source?: PluginFileOpenerProps["source"];
  files?: Record<string, string | Error>;
  encoding?: "utf8" | "base64";
} = {}) {
  const reads: Read[] = [];
  const read = async ({ signal: _signal, ...args }: Read & { signal?: AbortSignal }) => {
    reads.push(args);
    const content = files[args.path];
    if (content === undefined || content instanceof Error) throw content ?? new Error(`no file ${args.path}`);
    const encoded =
      encoding === "utf8" ? content : btoa(String.fromCharCode(...new TextEncoder().encode(content)));
    return { content: encoded, contentEncoding: encoding, path: args.path, sha256: `sha:${content}`, sizeBytes: content.length } as never;
  };
  const slot = renderSlot(opener, { path, source, Original } satisfies PluginFileOpenerProps, {
    sdk: {
      environments: { get: async () => ({ hostId: "host_1", path: "/work/repo" }) as never },
      threads: { storageLocation: async () => ({ hostId: "host_2", storageRootPath: "/storage/thr_1/" }) },
      files: { read },
    },
  });
  const frame = () => slot.container.querySelector<HTMLIFrameElement>("[data-pele-file] iframe");
  const original = () => within(slot.container).queryByTestId("original");
  return { slot, reads, files, frame, original };
}

const settle = () => act(async () => {});

describe("mermaid file opener", () => {
  test("claims .mmd and .mermaid files", () => {
    expect(app.fileOpeners).toHaveLength(1);
    expect(opener.extensions).toEqual(["mmd", "mermaid"]);
  });

  test("draws a workspace file in a pan and zoom view", async () => {
    const { slot, reads, frame } = openFile();
    await settle();
    expect(reads).toEqual([{ hostId: "host_1", path: "/work/repo/docs/flow.mmd", rootPath: "/work/repo" }]);
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-flowchart");
    expect(frame()?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(within(slot.container).getByRole("heading").textContent).toBe("flow.mmd");
    const controls = within(slot.container).getByRole("group", { name: "Viewer controls" });
    for (const name of ["Zoom in", "Zoom out", "Reset view", "Show Mermaid source", "Copy Mermaid source"]) {
      expect(within(controls).getByRole("button", { name })).toBeTruthy();
    }
    await act(async () => fireEvent.click(within(controls).getByRole("button", { name: "Copy Mermaid source" })));
    expect(slot.inspection.experimental_clipboardWrites).toEqual([{ text: FLOWCHART }]);
  });

  test("resolves thread-storage files under the storage root", async () => {
    const { reads, frame } = openFile({
      path: "diagrams/seq.mermaid",
      source: { kind: "thread-storage", threadId: "thr_1", environmentId: null, projectId: null },
      files: { "/storage/thr_1/diagrams/seq.mermaid": SEQUENCE },
    });
    await settle();
    expect(reads[0]).toEqual({ hostId: "host_2", path: "/storage/thr_1/diagrams/seq.mermaid", rootPath: "/storage/thr_1/" });
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-sequence");
  });

  test("reads host files at their absolute path", async () => {
    const { reads, frame } = openFile({
      path: "/home/me/flow.mmd",
      source: { kind: "host", threadId: null, environmentId: null, projectId: null, experimental_hostId: "host_9" },
      files: { "/home/me/flow.mmd": FLOWCHART },
    });
    await settle();
    expect(reads[0]).toEqual({ hostId: "host_9", path: "/home/me/flow.mmd" });
    expect(frame()).not.toBeNull();
  });

  test("decodes base64 file content as UTF-8", async () => {
    const { frame } = openFile({ encoding: "base64", files: { "/work/repo/docs/flow.mmd": "flowchart LR\n  A[Café ✓] --> B" } });
    await settle();
    expect(frame()?.getAttribute("srcdoc")).toContain("Café ✓");
  });

  test("falls back to bb's preview when the file does not parse or cannot be read", async () => {
    const broken = openFile({ files: { "/work/repo/docs/flow.mmd": "not a diagram" } });
    await settle();
    expect(broken.original()).not.toBeNull();
    expect(broken.frame()).toBeNull();
    broken.slot.lifecycle.unmount();

    const missing = openFile({ files: {} });
    await settle();
    expect(missing.original()).not.toBeNull();
  });

  test("show source swaps the diagram for bb's preview and back", async () => {
    const { slot, frame, original } = openFile();
    await settle();
    const toggle = within(slot.container).getByRole("button", { name: "Show Mermaid source" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(original()).not.toBeNull();
    expect(frame()).toBeNull();
    expect(within(slot.container).queryByRole("button", { name: "Zoom in" })).toBeNull();
    fireEvent.click(toggle);
    expect(frame()).not.toBeNull();
    expect(original()).toBeNull();
  });

  test("redraws when the file changes and stops reading once closed", async () => {
    vi.useFakeTimers();
    const { slot, reads, files, frame } = openFile();
    await settle();
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-flowchart");
    files["/work/repo/docs/flow.mmd"] = SEQUENCE;
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-sequence");
    const count = reads.length;
    slot.lifecycle.unmount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS * 3)));
    expect(reads).toHaveLength(count);
  });

  test("a failed refresh keeps the last diagram", async () => {
    vi.useFakeTimers();
    const { files, frame, original } = openFile();
    await settle();
    files["/work/repo/docs/flow.mmd"] = new Error("gone");
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-flowchart");
    expect(original()).toBeNull();
  });
});
