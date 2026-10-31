import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ExperimentalCodeFenceRendererProps } from "@get-bb/plugin-sdk/app";
import { cleanup, within } from "@testing-library/react";
import { render as renderPele } from "pele";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const FLOWCHART = "flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]";
const BROKEN = "flowchart LR\n  A --> ";
const LINKED = `${FLOWCHART}\n  click A "https://example.com/phish"`;
const SCRIPTED = `${FLOWCHART}\n  click A "javascript:alert(1)"`;
const IMAGED = 'flowchart TD\n  A@{ img: "https://example.com/x.png", label: "Pic", pos: "t", w: 60, h: 60 }\n  A --> B';
const TAGGED = 'flowchart LR\n  A["<script>alert(1)</script><img src=x onerror=alert(1)>"] --> B';

const resizeObservers: { disconnected: boolean }[] = [];

beforeEach(() => {
  resizeObservers.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      state = { disconnected: false };
      constructor() {
        resizeObservers.push(this.state);
      }
      observe() {}
      disconnect() {
        this.state.disconnected = true;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});

const app = await loadPluginApp(() => import("./app"));
const registration = app.codeFenceRenderers[0]!;

function Original() {
  return <pre data-testid="original">stock code block</pre>;
}

function fence(code: string, status: ExperimentalCodeFenceRendererProps["status"], index = 0) {
  const props: ExperimentalCodeFenceRendererProps = {
    code,
    status,
    index,
    language: "mermaid",
    message: { id: "msg_1", threadId: "thr_1", turnId: null, projectId: null },
    Original,
  };
  return props;
}

function mount(props: ExperimentalCodeFenceRendererProps) {
  const slot = renderSlot(registration, props);
  const frame = () => slot.container.querySelector("iframe");
  const original = () => within(slot.container).queryByTestId("original");
  return { slot, frame, original, view: () => slot.container.querySelector("[data-pele-fence]")?.getAttribute("data-pele-view") };
}

describe("registration", () => {
  test("claims only the mermaid language", () => {
    expect(app.codeFenceRenderers).toHaveLength(1);
    expect(registration.id).toBe("pele");
    expect(registration.languages).toEqual(["mermaid"]);
  });
});

describe("fence lifecycle", () => {
  test("a streaming fence shows its source and no diagram", () => {
    const { slot, frame, original, view } = mount(fence(FLOWCHART, "streaming"));
    expect(view()).toBe("source");
    expect(slot.container.querySelector("pre")?.textContent).toBe(FLOWCHART);
    expect(frame()).toBeNull();
    expect(original()).toBeNull();
  });

  test("a closed fence renders the diagram in a frame", () => {
    const { frame, original, view } = mount(fence(FLOWCHART, "closed"));
    expect(view()).toBe("diagram");
    expect(frame()?.getAttribute("srcdoc")).toContain('<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-flowchart"');
    expect(frame()?.getAttribute("title")).toBe("Mermaid flowchart diagram");
    expect(original()).toBeNull();
  });

  test("the fence switches from source to diagram when it closes", () => {
    const { slot, frame, view } = mount(fence("flowchart LR\n  A --> ", "streaming"));
    expect(frame()).toBeNull();
    slot.lifecycle.rerender(<registration.component {...fence(FLOWCHART, "closed")} />);
    expect(view()).toBe("diagram");
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-flowchart");
  });

  test("a closed fence re-renders when its code changes", () => {
    const { slot, frame } = mount(fence(FLOWCHART, "closed"));
    slot.lifecycle.rerender(<registration.component {...fence("sequenceDiagram\n  A->>B: hi", "closed")} />);
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-sequence");
  });

  test("an unclosed fence shows bb's code block even when it would parse", () => {
    const { frame, original, view } = mount(fence(FLOWCHART, "unclosed"));
    expect(view()).toBe("original");
    expect(original()).not.toBeNull();
    expect(frame()).toBeNull();
  });

  test("a fence Pele cannot parse falls back to bb's code block", () => {
    for (const code of [BROKEN, "not a diagram", ""]) {
      const { slot, frame, original, view } = mount(fence(code, "closed"));
      expect(view()).toBe("error");
      expect(original()).not.toBeNull();
      expect(frame()).toBeNull();
      slot.lifecycle.unmount();
    }
  });

  test("each fence is tagged with its own index", () => {
    const { slot } = mount(fence(FLOWCHART, "closed", 3));
    expect(slot.container.querySelector("[data-pele-fence]")?.getAttribute("data-pele-fence")).toBe("3");
  });

  test("unmounting stops watching the frame's width", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    expect(resizeObservers).toHaveLength(1);
    slot.lifecycle.unmount();
    expect(resizeObservers[0]?.disconnected).toBe(true);
  });
});

describe("isolation", () => {
  test("the frame is sandboxed without scripts, forms, popups or navigation", () => {
    const { frame } = mount(fence(FLOWCHART, "closed"));
    expect(frame()?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame()?.getAttribute("srcdoc")).toContain("default-src 'none'");
    expect(frame()?.getAttribute("srcdoc")).not.toContain("script-src");
  });

  test("click directives become no links", () => {
    expect(renderPele(LINKED).svg).toMatch(/<a[\s>]/);
    for (const code of [LINKED, SCRIPTED]) {
      const srcdoc = mount(fence(code, "closed")).frame()?.getAttribute("srcdoc") ?? "";
      expect(srcdoc).toContain("pele-flowchart");
      expect(srcdoc).not.toMatch(/<a[\s>]/);
      expect(srcdoc).not.toContain("example.com/phish");
      expect(srcdoc).not.toContain("javascript:");
    }
  });

  test("image shapes load no remote image", () => {
    expect(renderPele(IMAGED).svg).toMatch(/<image[\s>]/);
    const srcdoc = mount(fence(IMAGED, "closed")).frame()?.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("pele-flowchart");
    expect(srcdoc).not.toMatch(/<image[\s>]/);
    expect(srcdoc).not.toContain("example.com/x.png");
  });

  test("markup in labels stays text", () => {
    const srcdoc = mount(fence(TAGGED, "closed")).frame()?.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("pele-flowchart");
    expect(srcdoc).not.toMatch(/<script|<img/i);
  });
});

describe("theme", () => {
  test("the frame starts with bb's tokens for the current mode", () => {
    document.documentElement.className = "dark";
    document.documentElement.style.setProperty("--foreground", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--font-sans", "Inter, sans-serif");
    const srcdoc = mount(fence(FLOWCHART, "closed")).frame()?.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("color-scheme:dark;");
    expect(srcdoc).toContain("--pele-fg:rgb(1, 2, 3);");
    expect(srcdoc).toContain("--pele-font:Inter, sans-serif;");
  });

  test("a mode switch recolors the frame without rebuilding it", async () => {
    document.documentElement.style.setProperty("--foreground", "rgb(1, 2, 3)");
    const { frame } = mount(fence(FLOWCHART, "closed"));
    const before = frame()?.getAttribute("srcdoc");
    expect(frame()?.style.colorScheme).toBe("light");

    document.documentElement.className = "dark";
    document.documentElement.style.setProperty("--foreground", "rgb(250, 250, 250)");

    await vi.waitFor(() => expect(frame()?.style.colorScheme).toBe("dark"));
    expect(frame()?.getAttribute("srcdoc")).toBe(before);
  });
});
