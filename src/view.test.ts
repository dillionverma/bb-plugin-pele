import { describe, expect, test } from "vitest";
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
  startView,
  zoomAt,
} from "./view";

const viewport = { width: 800, height: 600 };

describe("fitView", () => {
  test("shrinks a wide diagram to the viewport width and centers it", () => {
    const view = fitView({ width: 3000, height: 200 }, viewport);
    expect(view.scale).toBeCloseTo((800 - 32) / 3000);
    expect(view.x).toBeCloseTo(16);
    expect(view.y).toBeCloseTo((600 - 200 * view.scale) / 2);
  });

  test("shrinks a tall diagram to the viewport height", () => {
    const view = fitView({ width: 100, height: 2000 }, viewport);
    expect(view.scale).toBeCloseTo((600 - 32) / 2000);
    expect(view.y).toBeCloseTo(16);
  });

  test("keeps a small diagram at its natural size, centered", () => {
    expect(fitView({ width: 200, height: 100 }, viewport)).toEqual({ scale: 1, x: 300, y: 250 });
  });

  test("never drops below the minimum scale", () => {
    expect(fitView({ width: 1e6, height: 10 }, viewport).scale).toBe(MIN_SCALE);
  });
});

describe("zoomAt", () => {
  const view = { scale: 1, x: 100, y: 50 };

  test("keeps the point under the anchor in place", () => {
    const anchor = { x: 300, y: 200 };
    const before = { x: (anchor.x - view.x) / view.scale, y: (anchor.y - view.y) / view.scale };
    const zoomed = zoomAt(view, 2, anchor);
    expect(zoomed.scale).toBe(2);
    expect(zoomed.x + before.x * zoomed.scale).toBeCloseTo(anchor.x);
    expect(zoomed.y + before.y * zoomed.scale).toBeCloseTo(anchor.y);
  });

  test("clamps the scale and leaves the view still at the limit", () => {
    const top = { scale: MAX_SCALE, x: 10, y: 20 };
    expect(zoomAt(top, 2, { x: 300, y: 200 })).toEqual(top);
    expect(zoomAt(view, 1e-6, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });
});

test("panBy moves the view without changing the scale", () => {
  expect(panBy({ scale: 2, x: 10, y: 20 }, -5, 15)).toEqual({ scale: 2, x: 5, y: 35 });
});

test("a fit camera follows the viewport, a manual one does not", () => {
  const content = { width: 1600, height: 100 };
  expect(cameraView(FIT, content, { width: 432, height: 300 }).scale).toBeCloseTo(0.25);
  expect(cameraView(FIT, content, { width: 832, height: 300 }).scale).toBeCloseTo(0.5);
  const manual = { kind: "manual", view: { scale: 3, x: 1, y: 2 } } as const;
  expect(cameraView(manual, content, { width: 832, height: 300 })).toEqual(manual.view);
});

describe("startView", () => {
  test("is the fit view when the whole diagram stays readable", () => {
    const content = { width: 1000, height: 200 };
    expect(fitView(content, viewport).scale).toBeGreaterThan(READABLE_SCALE);
    expect(startView(content, viewport)).toEqual(fitView(content, viewport));
  });

  test("shows a wide diagram's left edge at a readable scale, centered vertically", () => {
    const view = startView({ width: 4000, height: 200 }, viewport);
    expect(view).toEqual({ scale: READABLE_SCALE, x: 16, y: (600 - 200 * READABLE_SCALE) / 2 });
  });

  test("shows a tall diagram's top at a readable scale, centered horizontally", () => {
    const view = startView({ width: 300, height: 5000 }, viewport);
    expect(view).toEqual({ scale: READABLE_SCALE, x: (800 - 300 * READABLE_SCALE) / 2, y: 16 });
  });

  test("the start camera follows the viewport", () => {
    const content = { width: 4000, height: 200 };
    expect(cameraView(START, content, viewport)).toEqual(startView(content, viewport));
  });
});

describe("pinch", () => {
  const view = { scale: 1, x: 0, y: 0 };

  test("spreading two fingers zooms around their midpoint", () => {
    const zoomed = pinch(view, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    expect(zoomed).toEqual({ scale: 2, x: -150, y: -100 });
  });

  test("moving both fingers together pans", () => {
    const moved = pinch(view, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 10, y: 20 }, { x: 110, y: 20 }]);
    expect(moved).toEqual({ scale: 1, x: 10, y: 20 });
  });

  test("fingers on the same point only pan", () => {
    const point = { x: 5, y: 5 };
    expect(pinch(view, [point, point], [{ x: 7, y: 5 }, point])).toEqual({ scale: 1, x: 1, y: 0 });
  });
});
