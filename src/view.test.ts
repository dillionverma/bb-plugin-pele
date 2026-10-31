import { describe, expect, test } from "vitest";
import { cameraView, FIT, fitView, MAX_SCALE, MIN_SCALE, panBy, zoomAt } from "./view";

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
