import { experimental_usePluginId as usePluginId } from "@get-bb/plugin-sdk/app";
import * as Dialog from "@radix-ui/react-dialog";
import type { RenderResult } from "pele";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CopyButton, ToolButton } from "./controls";
import { DiagramFrame } from "./diagram-frame";
import { frameSize, type FrameTheme } from "./frame";
import {
  cameraView,
  FIT,
  fitView,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  pinch,
  READABLE_SCALE,
  START,
  ZOOM_STEP,
  zoomAt,
  type Camera,
  type Point,
  type Size,
  type View,
} from "./view";

const KEY_PAN = 48;
const LINE_HEIGHT = 16;

export type PanZoom = ReturnType<typeof usePanZoom>;

export function usePanZoom(diagram: RenderResult) {
  const content = frameSize(diagram);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>(START);
  const view = cameraView(camera, content, viewport);
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  useEffect(() => {
    if (element === null) return;
    const measure = () =>
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  const update = (change: (view: View) => View) =>
    setCamera((current) => ({
      kind: "manual",
      view: change(cameraView(current, content, viewport)),
    }));
  const zoom = (factor: number, anchor: Point = center) =>
    update((view) => zoomAt(view, factor, anchor));
  const pan = (dx: number, dy: number) => update((view) => panBy(view, dx, dy));
  const local = (clientX: number, clientY: number): Point => {
    const rect = element?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // React attaches wheel listeners as passive, so they cannot keep the page from scrolling.
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if (event.ctrlKey || event.metaKey) {
      const step = Math.max(-50, Math.min(50, dy));
      zoom(Math.exp(-step / 100), local(event.clientX, event.clientY));
    } else if (event.shiftKey && dx === 0) {
      pan(-dy, 0);
    } else {
      pan(-dx, -dy);
    }
  };
  useEffect(() => {
    if (element === null) return;
    const listener = (event: WheelEvent) => wheel.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, [element]);

  // One pointer drags; two pointers (fingers) pinch.
  const pointers = useRef(new Map<number, Point>());
  const [dragging, setDragging] = useState(false);
  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    setDragging(pointers.current.size > 0);
  };
  const pointerHandlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, local(event.clientX, event.clientY));
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const last = pointers.current.get(event.pointerId);
      if (last === undefined) return;
      const next = local(event.clientX, event.clientY);
      const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
      pointers.current.set(event.pointerId, next);
      if (other === undefined) pan(next.x - last.x, next.y - last.y);
      else update((view) => pinch(view, [last, other], [next, other]));
    },
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
  };

  const reset = () => setCamera(START);
  const fitAll = () => setCamera(FIT);
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
    canvasRef: setElement,
    content,
    view,
    dragging,
    pointerHandlers,
    onKeyDown,
    // The start view crops a diagram only when fitting it whole would be unreadable.
    canFitAll: fitView(content, viewport).scale < READABLE_SCALE,
    zoomIn: () => zoom(ZOOM_STEP),
    zoomOut: () => zoom(1 / ZOOM_STEP),
    reset,
    fitAll,
  };
}

export function ZoomControls({ panZoom }: { panZoom: PanZoom }) {
  const { view, zoomIn, zoomOut, reset, fitAll, canFitAll } = panZoom;
  return (
    <>
      <output
        aria-label="Zoom level"
        className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground"
      >
        {Math.round(view.scale * 100)}%
      </output>
      <ToolButton label="Zoom out" icon="ZoomOut" onClick={zoomOut} disabled={view.scale <= MIN_SCALE} />
      <ToolButton label="Zoom in" icon="ZoomIn" onClick={zoomIn} disabled={view.scale >= MAX_SCALE} />
      {canFitAll ? <ToolButton label="Fit whole diagram" icon="Minimize2" onClick={fitAll} /> : null}
      <ToolButton label="Reset view" icon="RotateCcw" onClick={reset} />
    </>
  );
}

export function PanZoomCanvas({
  panZoom,
  diagram,
  theme,
}: {
  panZoom: PanZoom;
  diagram: RenderResult;
  theme: FrameTheme;
}) {
  const { canvasRef, content, view, dragging, pointerHandlers } = panZoom;
  return (
    <div
      ref={canvasRef}
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
  );
}

export function ViewerHeader({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-1.5 pl-3 pr-1.5">
      {title}
      <div role="group" aria-label="Viewer controls" className="flex shrink-0 items-center gap-1">
        {children}
      </div>
    </div>
  );
}

export const VIEWER_TITLE_CLASS = "min-w-0 truncate font-mono text-xs uppercase text-muted-foreground";

function ViewerBody({
  code,
  diagram,
  theme,
}: {
  code: string;
  diagram: RenderResult;
  theme: FrameTheme;
}) {
  const panZoom = usePanZoom(diagram);
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={panZoom.onKeyDown}>
      <ViewerHeader
        title={<Dialog.Title className={VIEWER_TITLE_CLASS}>Mermaid {diagram.type} diagram</Dialog.Title>}
      >
        <ZoomControls panZoom={panZoom} />
        <CopyButton code={code} />
        <Dialog.Close asChild>
          <ToolButton label="Close" icon="X" className="pointer-coarse:size-10" />
        </Dialog.Close>
      </ViewerHeader>
      <PanZoomCanvas panZoom={panZoom} diagram={diagram} theme={theme} />
    </div>
  );
}

// bb's iOS app draws the page under the status bar and home indicator.
const SAFE_INSETS = [
  "top-[max(0.5rem,env(safe-area-inset-top))] sm:top-[max(1.5rem,env(safe-area-inset-top))]",
  "right-[max(0.5rem,env(safe-area-inset-right))] sm:right-[max(1.5rem,env(safe-area-inset-right))]",
  "bottom-[max(0.5rem,env(safe-area-inset-bottom))] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))]",
  "left-[max(0.5rem,env(safe-area-inset-left))] sm:left-[max(1.5rem,env(safe-area-inset-left))]",
].join(" ");

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
          className={`fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm focus:outline-none ${SAFE_INSETS}`}
        >
          <ViewerBody code={code} diagram={diagram} theme={theme} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
