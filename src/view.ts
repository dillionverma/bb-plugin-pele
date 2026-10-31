export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

// The content's top-left corner sits at (x, y) in the viewport, drawn at `scale`.
export interface View extends Point {
  scale: number;
}

// "start" and "fit" follow the viewport as it resizes until the user zooms or pans.
export type Camera = { kind: "start" } | { kind: "fit" } | { kind: "manual"; view: View };

export const START: Camera = { kind: "start" };
export const FIT: Camera = { kind: "fit" };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;
// Below this, 16px labels drop under about 10px.
export const READABLE_SCALE = 0.6;
const FIT_MARGIN = 16;

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

// Fit shrinks a large diagram to the viewport but never enlarges a small one.
export function fitView(content: Size, viewport: Size): View {
  const room = {
    width: Math.max(1, viewport.width - 2 * FIT_MARGIN),
    height: Math.max(1, viewport.height - 2 * FIT_MARGIN),
  };
  const scale = clampScale(
    Math.min(1, room.width / content.width, room.height / content.height),
  );
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}

// The whole diagram when that is readable, otherwise its top-left corner at a readable scale.
export function startView(content: Size, viewport: Size): View {
  const fit = fitView(content, viewport);
  if (fit.scale >= READABLE_SCALE) return fit;
  const scale = READABLE_SCALE;
  const place = (length: number, room: number) =>
    length * scale + 2 * FIT_MARGIN <= room ? (room - length * scale) / 2 : FIT_MARGIN;
  return {
    scale,
    x: place(content.width, viewport.width),
    y: place(content.height, viewport.height),
  };
}

export function cameraView(camera: Camera, content: Size, viewport: Size): View {
  switch (camera.kind) {
    case "start":
      return startView(content, viewport);
    case "fit":
      return fitView(content, viewport);
    case "manual":
      return camera.view;
  }
}

// Scales by `factor` while the content under `anchor` stays where it is.
export function zoomAt(view: View, factor: number, anchor: Point): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Two fingers moved from `from` to `to`: the content follows their midpoint and scales with their spread.
export function pinch(view: View, from: [Point, Point], to: [Point, Point]): View {
  const before = midpoint(...from);
  const after = midpoint(...to);
  const spread = distance(...from);
  const moved = panBy(view, after.x - before.x, after.y - before.y);
  return spread === 0 ? moved : zoomAt(moved, distance(...to) / spread, after);
}
