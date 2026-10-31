import { experimental_usePluginId as usePluginId } from "@get-bb/plugin-sdk/app";
import * as Dialog from "@radix-ui/react-dialog";
import type { RenderResult } from "pele";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CopyButton, ToolButton } from "./controls";
import { DiagramFrame } from "./diagram-frame";
import { frameSize, type FrameTheme } from "./frame";
import {
  cameraView,
  FIT,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  ZOOM_STEP,
  zoomAt,
  type Camera,
  type Point,
  type Size,
  type View,
} from "./view";

const KEY_PAN = 48;
const LINE_HEIGHT = 16;

function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function usePanZoom(content: Size) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(viewportRef);
  const [camera, setCamera] = useState<Camera>(FIT);
  const view = cameraView(camera, content, viewport);
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  const update = (change: (view: View) => View) =>
    setCamera((current) => ({
      kind: "manual",
      view: change(cameraView(current, content, viewport)),
    }));
  const zoom = (factor: number, anchor: Point = center) =>
    update((view) => zoomAt(view, factor, anchor));
  const pan = (dx: number, dy: number) => update((view) => panBy(view, dx, dy));
  const reset = () => setCamera(FIT);

  // React attaches wheel listeners as passive, so they cannot keep the page from scrolling.
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if (event.ctrlKey || event.metaKey) {
      const rect = viewportRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const step = Math.max(-50, Math.min(50, dy));
      zoom(Math.exp(-step / 100), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    } else if (event.shiftKey && dx === 0) {
      pan(-dy, 0);
    } else {
      pan(-dx, -dy);
    }
  };
  useEffect(() => {
    const element = viewportRef.current;
    if (element === null) return;
    const listener = (event: WheelEvent) => wheel.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);

  const drag = useRef<{ pointerId: number; last: Point } | null>(null);
  const [dragging, setDragging] = useState(false);
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  }
  const pointerHandlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (current === null || current.pointerId !== event.pointerId) return;
      pan(event.clientX - current.last.x, event.clientY - current.last.y);
      current.last = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action: Record<string, () => void> = {
      "+": () => zoom(ZOOM_STEP),
      "=": () => zoom(ZOOM_STEP),
      "-": () => zoom(1 / ZOOM_STEP),
      "0": reset,
      ArrowLeft: () => pan(KEY_PAN, 0),
      ArrowRight: () => pan(-KEY_PAN, 0),
      ArrowUp: () => pan(0, KEY_PAN),
      ArrowDown: () => pan(0, -KEY_PAN),
    };
    const run = action[event.key];
    if (run === undefined) return;
    event.preventDefault();
    run();
  };

  return {
    viewportRef,
    view,
    dragging,
    pointerHandlers,
    onKeyDown,
    zoomIn: () => zoom(ZOOM_STEP),
    zoomOut: () => zoom(1 / ZOOM_STEP),
    reset,
  };
}

function ViewerBody({
  code,
  diagram,
  theme,
}: {
  code: string;
  diagram: RenderResult;
  theme: FrameTheme;
}) {
  const content = frameSize(diagram);
  const { viewportRef, view, dragging, pointerHandlers, onKeyDown, zoomIn, zoomOut, reset } =
    usePanZoom(content);
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between gap-2 border-b border-border py-1.5 pl-3 pr-1.5">
        <Dialog.Title className="truncate font-mono text-xs uppercase text-muted-foreground">
          Mermaid {diagram.type} diagram
        </Dialog.Title>
        <div role="group" aria-label="Viewer controls" className="flex items-center gap-1">
          <output
            aria-label="Zoom level"
            className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground"
          >
            {Math.round(view.scale * 100)}%
          </output>
          <ToolButton
            label="Zoom out"
            icon="ZoomOut"
            onClick={zoomOut}
            disabled={view.scale <= MIN_SCALE}
          />
          <ToolButton
            label="Zoom in"
            icon="ZoomIn"
            onClick={zoomIn}
            disabled={view.scale >= MAX_SCALE}
          />
          <ToolButton label="Reset view" icon="RotateCcw" onClick={reset} />
          <CopyButton code={code} />
          <Dialog.Close asChild>
            <ToolButton label="Close" icon="X" />
          </Dialog.Close>
        </div>
      </div>
      <div
        ref={viewportRef}
        data-pele-viewport=""
        data-dragging={dragging ? "" : undefined}
        tabIndex={0}
        role="application"
        aria-roledescription="diagram viewer"
        aria-label="Diagram. Drag or scroll to pan. Pinch, Ctrl and scroll, or plus and minus to zoom. 0 resets the view."
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring data-[dragging]:cursor-grabbing"
        {...pointerHandlers}
      >
        <DiagramFrame
          diagram={diagram}
          theme={theme}
          className="pointer-events-none absolute left-0 top-0 block border-0"
          style={{
            width: content.width,
            height: content.height,
            transformOrigin: "0 0",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        />
      </div>
    </div>
  );
}

// bb scopes plugin styles to these attributes, so portaled overlays carry them too.
function usePortalScope() {
  return {
    "data-bb-portaled-overlay": "",
    "data-bb-plugin-root": "",
    "data-bb-plugin": usePluginId(),
  };
}

export function DiagramViewer({
  open,
  onOpenChange,
  trigger,
  code,
  diagram,
  theme,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  trigger: ReactNode;
  code: string;
  diagram: RenderResult;
  theme: FrameTheme;
}) {
  const scope = usePortalScope();
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay {...scope} className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          {...scope}
          ref={contentRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.querySelector<HTMLElement>("[data-pele-viewport]")?.focus();
          }}
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm focus:outline-none sm:inset-6"
        >
          <ViewerBody code={code} diagram={diagram} theme={theme} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
