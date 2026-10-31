import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ExperimentalCodeFenceRendererProps } from "@get-bb/plugin-sdk/app";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render as renderPele } from "pele";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { frameSize } from "./frame";
import { fitView, READABLE_SCALE, startView } from "./view";

const FLOWCHART = "flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]";
const BROKEN = "flowchart LR\n  A --> ";
const LINKED = `${FLOWCHART}\n  click A "https://example.com/phish"`;
const SCRIPTED = `${FLOWCHART}\n  click A "javascript:alert(1)"`;
const IMAGED = 'flowchart TD\n  A@{ img: "https://example.com/x.png", label: "Pic", pos: "t", w: 60, h: 60 }\n  A --> B';
const TAGGED = 'flowchart LR\n  A["<script>alert(1)</script><img src=x onerror=alert(1)>"] --> B';

const WIDE = `flowchart LR\n  ${Array.from({ length: 24 }, (_, i) => `N${i}[Step number ${i}]`).join(" --> ")}`;
const VIEWPORT = { width: 800, height: 600 };

const resizeObservers: { disconnected: boolean; target: Element | null; notify(): void }[] = [];

beforeEach(() => {
  resizeObservers.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      state: (typeof resizeObservers)[number];
      constructor(callback: () => void) {
        this.state = { disconnected: false, target: null, notify: callback };
        resizeObservers.push(this.state);
      }
      observe(target: Element) {
        this.state.target = target;
      }
      disconnect() {
        this.state.disconnected = true;
      }
    },
  );
  const viewportSize = (name: "width" | "height") =>
    function (this: HTMLElement) {
      return this.hasAttribute("data-pele-viewport") ? VIEWPORT[name] : 0;
    };
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(viewportSize("width"));
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(viewportSize("height"));
  Element.prototype.setPointerCapture = () => {};
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

function mount(props: ExperimentalCodeFenceRendererProps, options?: Parameters<typeof renderSlot>[2]) {
  const slot = renderSlot(registration, props, options);
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

  // bb's iOS app cancels subframe navigations to about:srcdoc, which left every diagram blank there.
  test("the frame draws without navigating anywhere", () => {
    const { frame } = mount(fence(FLOWCHART, "closed"));
    expect(frame()?.hasAttribute("srcdoc")).toBe(false);
    expect(frame()?.hasAttribute("src")).toBe(false);
    expect(frame()?.contentDocument?.querySelector("body > svg.pele-flowchart")).not.toBeNull();
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

const button = (scope: HTMLElement, name: string | RegExp) => within(scope).getByRole("button", { name });
const dialog = () => screen.queryByRole("dialog");
const viewport = () => document.querySelector<HTMLElement>("[data-pele-viewport]")!;
const viewerFrame = () => dialog()?.querySelector("iframe") ?? null;
const zoomLevel = () => within(dialog()!).getByRole("status", { name: "Zoom level" }).textContent;

function transformOf(frame: HTMLIFrameElement | null) {
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(frame?.style.transform ?? "");
  if (match === null) throw new Error(`no view transform on ${frame?.outerHTML.slice(0, 80)}`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function openViewer(container: HTMLElement) {
  fireEvent.click(button(container, "Open Mermaid diagram"));
  return dialog()!;
}

describe("toolbar", () => {
  test("a rendered diagram gets source, open and copy buttons", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    const controls = within(slot.container).getByRole("group", { name: "Diagram controls" });
    expect(within(controls).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Show Mermaid source",
      "Open Mermaid diagram",
      "Copy Mermaid source",
    ]);
    expect(button(controls, "Show Mermaid source").getAttribute("aria-pressed")).toBe("false");
  });

  test("streaming, unclosed and unparsable fences have no Pele controls", () => {
    for (const props of [fence(FLOWCHART, "streaming"), fence(FLOWCHART, "unclosed"), fence(BROKEN, "closed")]) {
      const { slot } = mount(props);
      expect(within(slot.container).queryByRole("group", { name: "Diagram controls" })).toBeNull();
      slot.lifecycle.unmount();
    }
  });

  test("show source swaps the diagram for the exact fence source and back", () => {
    const { slot, frame } = mount(fence(FLOWCHART, "closed"));
    const toggle = button(slot.container, "Show Mermaid source");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const source = within(slot.container).getByTestId("bb-source-code");
    expect(source.textContent).toBe(FLOWCHART);
    expect(source.getAttribute("data-path")).toBe("diagram.mmd");
    expect(frame()).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(within(slot.container).queryByTestId("bb-source-code")).toBeNull();
    expect(frame()?.getAttribute("srcdoc")).toContain("pele-flowchart");
  });
});

describe("copy", () => {
  test("copies the exact fence source and says so", async () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    await act(async () => fireEvent.click(button(slot.container, "Copy Mermaid source")));
    expect(slot.inspection.experimental_clipboardWrites).toEqual([{ text: FLOWCHART }]);
    expect(button(slot.container, "Copied Mermaid source")).toBeTruthy();
    expect(within(slot.container).getByRole("status").textContent).toBe("Copied Mermaid source");
  });

  test("a failed copy says it failed, then the button resets", async () => {
    vi.useFakeTimers();
    try {
      const { slot } = mount(fence(FLOWCHART, "closed"), { experimental_copyToClipboard: async () => false });
      await act(async () => fireEvent.click(button(slot.container, "Copy Mermaid source")));
      const failed = button(slot.container, "Could not copy Mermaid source");
      expect(failed.className).toContain("text-destructive");
      expect(within(slot.container).getByRole("status").textContent).toBe("Could not copy Mermaid source");
      act(() => vi.advanceTimersByTime(2000));
      expect(button(slot.container, "Copy Mermaid source")).toBeTruthy();
      expect(within(slot.container).getByRole("status").textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("several fences", () => {
  const SEQUENCE = "sequenceDiagram\n  A->>B: hi";

  function mountTwo() {
    const { slot } = mount(fence(FLOWCHART, "closed", 0));
    slot.lifecycle.rerender(
      <>
        <registration.component {...fence(FLOWCHART, "closed", 0)} />
        <registration.component {...fence(SEQUENCE, "closed", 1)} />
      </>,
    );
    const [first, second] = [...slot.container.querySelectorAll<HTMLElement>("[data-pele-fence]")];
    return { slot, first: first!, second: second! };
  }

  test("copy and source act on their own fence", async () => {
    const { slot, first, second } = mountTwo();
    await act(async () => fireEvent.click(button(second, "Copy Mermaid source")));
    expect(slot.inspection.experimental_clipboardWrites).toEqual([{ text: SEQUENCE }]);
    expect(button(first, "Copy Mermaid source")).toBeTruthy();

    fireEvent.click(button(first, "Show Mermaid source"));
    expect(within(first).getByTestId("bb-source-code").textContent).toBe(FLOWCHART);
    expect(within(second).queryByTestId("bb-source-code")).toBeNull();
    expect(button(second, "Show Mermaid source").getAttribute("aria-pressed")).toBe("false");
  });

  test("each viewer shows and copies its own diagram and starts at fit", async () => {
    const { slot, first, second } = mountTwo();
    openViewer(first);
    fireEvent.click(button(dialog()!, "Zoom in"));
    expect(dialog()!.textContent).toContain("Mermaid flowchart diagram");
    fireEvent.keyDown(viewport(), { key: "Escape" });
    expect(dialog()).toBeNull();

    openViewer(second);
    expect(within(dialog()!).getByRole("heading").textContent).toBe("Mermaid sequence diagram");
    expect(viewerFrame()?.getAttribute("srcdoc")).toContain("pele-sequence");
    expect(zoomLevel()).toBe("100%");
    await act(async () => fireEvent.click(button(dialog()!, "Copy Mermaid source")));
    expect(slot.inspection.experimental_clipboardWrites).toEqual([{ text: SEQUENCE }]);
  });
});

describe("viewer", () => {
  test("a diagram that fits readably opens whole, with no fit button", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    const opened = openViewer(slot.container);
    expect(slot.container.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(within(opened).getByRole("heading").textContent).toBe("Mermaid flowchart diagram");
    expect(document.activeElement).toBe(viewport());
    const fit = fitView(frameSize(renderPele(FLOWCHART)), VIEWPORT);
    expect(transformOf(viewerFrame())).toEqual(fit);
    expect(within(opened).queryByRole("button", { name: "Fit whole diagram" })).toBeNull();
  });

  test("a very wide diagram opens readable at its left edge, and can be fitted whole", () => {
    const { slot } = mount(fence(WIDE, "closed"));
    const opened = openViewer(slot.container);
    const content = frameSize(renderPele(WIDE));
    const fit = fitView(content, VIEWPORT);
    expect(fit.scale).toBeLessThan(READABLE_SCALE);
    const start = transformOf(viewerFrame());
    expect(start).toEqual(startView(content, VIEWPORT));
    expect(start.scale).toBe(READABLE_SCALE);
    expect(start.x).toBe(16);
    expect(viewerFrame()?.style.width).toBe(`${content.width}px`);
    expect(zoomLevel()).toBe("60%");

    fireEvent.click(button(opened, "Fit whole diagram"));
    const whole = transformOf(viewerFrame());
    expect(whole.scale).toBeCloseTo(fit.scale);
    expect(whole.x).toBeCloseTo(fit.x);
    expect(zoomLevel()).toBe(`${Math.round(fit.scale * 100)}%`);
    fireEvent.click(button(opened, "Reset view"));
    expect(transformOf(viewerFrame())).toEqual(start);
  });

  test("two fingers pinch to zoom around their midpoint and pan with it", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    const start = transformOf(viewerFrame());
    const touch = (type: "pointerDown" | "pointerMove" | "pointerUp", pointerId: number, clientX: number, clientY: number) =>
      fireEvent[type](viewport(), { pointerId, pointerType: "touch", button: 0, clientX, clientY });
    touch("pointerDown", 1, 300, 300);
    touch("pointerDown", 2, 500, 300);
    touch("pointerMove", 2, 700, 300);
    const zoomed = transformOf(viewerFrame());
    expect(zoomed.scale).toBeCloseTo(start.scale * 2);
    const anchor = { x: 500, y: 300 };
    const before = { x: (400 - start.x) / start.scale, y: (300 - start.y) / start.scale };
    expect(zoomed.x + before.x * zoomed.scale).toBeCloseTo(anchor.x);
    expect(zoomed.y + before.y * zoomed.scale).toBeCloseTo(anchor.y);
    touch("pointerUp", 2, 700, 300);
    touch("pointerMove", 1, 320, 310);
    expect(transformOf(viewerFrame())).toEqual({ ...zoomed, x: zoomed.x + 20, y: zoomed.y + 10 });
    touch("pointerUp", 1, 320, 310);
    expect(viewport().hasAttribute("data-dragging")).toBe(false);
  });

  test("the viewer frame keeps the inline frame's sandbox and CSP", () => {
    const { slot, frame } = mount(fence(LINKED, "closed"));
    openViewer(slot.container);
    const inViewer = viewerFrame()!;
    expect(inViewer.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(inViewer.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(inViewer.getAttribute("srcdoc")).toBe(frame()?.getAttribute("srcdoc"));
    expect(inViewer.getAttribute("srcdoc")).not.toMatch(/<a[\s>]|script-src/);
    expect(inViewer.className).toContain("pointer-events-none");
  });

  test("zoom buttons zoom around the center and reset fits again", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    const fit = transformOf(viewerFrame());
    expect(fit.scale).toBe(1);
    const center = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    fireEvent.click(button(dialog()!, "Zoom in"));
    const zoomed = transformOf(viewerFrame());
    expect(zoomed.scale).toBeCloseTo(1.25);
    expect(zoomed.x).toBeCloseTo(center.x - (center.x - fit.x) * 1.25);
    expect(zoomLevel()).toBe("125%");
    fireEvent.click(button(dialog()!, "Zoom out"));
    fireEvent.click(button(dialog()!, "Zoom out"));
    expect(transformOf(viewerFrame()).scale).toBeCloseTo(0.8);
    fireEvent.click(button(dialog()!, "Reset view"));
    expect(transformOf(viewerFrame())).toEqual(fit);
  });

  test("zoom in stops at the limit", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    const zoomIn = button(dialog()!, "Zoom in") as HTMLButtonElement;
    for (let i = 0; i < 20 && !zoomIn.disabled; i++) fireEvent.click(zoomIn);
    expect(zoomIn.disabled).toBe(true);
    expect(zoomLevel()).toBe("800%");
  });

  test("dragging pans the diagram", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    const start = transformOf(viewerFrame());
    fireEvent.pointerDown(viewport(), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    expect(viewport().hasAttribute("data-dragging")).toBe(true);
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 160, clientY: 70 });
    fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 160, clientY: 70 });
    fireEvent.pointerMove(viewport(), { pointerId: 1, clientX: 400, clientY: 400 });
    expect(transformOf(viewerFrame())).toEqual({ ...start, x: start.x + 60, y: start.y - 30 });
    expect(viewport().hasAttribute("data-dragging")).toBe(false);
  });

  test("scrolling pans, pinch or ctrl-scroll zooms, and neither scrolls the page", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    const start = transformOf(viewerFrame());
    const scroll = new WheelEvent("wheel", { deltaX: 10, deltaY: 40, cancelable: true, bubbles: true });
    act(() => void viewport().dispatchEvent(scroll));
    expect(scroll.defaultPrevented).toBe(true);
    expect(transformOf(viewerFrame())).toEqual({ ...start, x: start.x - 10, y: start.y - 40 });

    const pinch = new WheelEvent("wheel", { deltaY: -20, ctrlKey: true, cancelable: true, bubbles: true });
    act(() => void viewport().dispatchEvent(pinch));
    expect(pinch.defaultPrevented).toBe(true);
    expect(transformOf(viewerFrame()).scale).toBeCloseTo(Math.exp(0.2));
  });

  test("the keyboard zooms, pans and resets", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    const fit = transformOf(viewerFrame());
    fireEvent.keyDown(viewport(), { key: "+" });
    expect(transformOf(viewerFrame()).scale).toBeCloseTo(1.25);
    fireEvent.keyDown(viewport(), { key: "-" });
    fireEvent.keyDown(viewport(), { key: "-" });
    expect(transformOf(viewerFrame()).scale).toBeCloseTo(0.8);
    fireEvent.keyDown(viewport(), { key: "0" });
    fireEvent.keyDown(viewport(), { key: "ArrowRight" });
    expect(transformOf(viewerFrame())).toEqual({ ...fit, x: fit.x - 48 });
  });

  test("a fitted view follows the viewport until the user moves it", () => {
    const { slot } = mount(fence(WIDE, "closed"));
    openViewer(slot.container);
    fireEvent.click(button(dialog()!, "Fit whole diagram"));
    const observer = resizeObservers.find((o) => o.target === viewport())!;
    const before = transformOf(viewerFrame()).scale;
    VIEWPORT.width = 400;
    try {
      act(() => observer.notify());
      expect(transformOf(viewerFrame()).scale).toBeCloseTo(before / 2, 1);
      fireEvent.click(button(dialog()!, "Zoom in"));
      const manual = transformOf(viewerFrame());
      VIEWPORT.width = 800;
      act(() => observer.notify());
      expect(transformOf(viewerFrame())).toEqual(manual);
    } finally {
      VIEWPORT.width = 800;
    }
  });

  test("Escape and Close return focus to the open button and drop the viewer", async () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    const open = button(slot.container, "Open Mermaid diagram");
    open.focus();
    openViewer(slot.container);
    const observer = resizeObservers.find((o) => o.target === viewport())!;
    fireEvent.keyDown(viewport(), { key: "Escape" });
    expect(dialog()).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(open));
    expect(observer.disconnected).toBe(true);

    openViewer(slot.container);
    expect(document.activeElement).toBe(viewport());
    fireEvent.click(button(dialog()!, "Close"));
    expect(dialog()).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(open));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });

  test("unmounting the fence closes an open viewer", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    slot.lifecycle.unmount();
    expect(dialog()).toBeNull();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });

  test("the viewer recolors with bb's mode", async () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    openViewer(slot.container);
    expect(viewerFrame()?.style.colorScheme).toBe("light");
    document.documentElement.className = "dark";
    await vi.waitFor(() => expect(viewerFrame()?.style.colorScheme).toBe("dark"));
  });

  test("portaled viewer parts carry bb's plugin scope", () => {
    const { slot } = mount(fence(FLOWCHART, "closed"));
    const opened = openViewer(slot.container);
    expect(opened.hasAttribute("data-bb-plugin-root")).toBe(true);
    expect(opened.hasAttribute("data-bb-portaled-overlay")).toBe(true);
    expect(opened.getAttribute("data-bb-plugin")).toBeTruthy();
  });
});
