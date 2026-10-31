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

// "fit" follows the viewport as it resizes until the user zooms or pans.
export type Camera = { kind: "fit" } | { kind: "manual"; view: View };

export const FIT: Camera = { kind: "fit" };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;
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

export function cameraView(camera: Camera, content: Size, viewport: Size): View {
  return camera.kind === "fit" ? fitView(content, viewport) : camera.view;
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
