/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  MAX_SCALE,
  clampTransform,
  doubleTapTarget,
  fitSize,
  lockAxis,
  naturalSizeScale,
  pageDecision,
  rubberBand,
  shouldDismiss,
  zoomAround,
} from "@/lib/ui/image-viewer-transform";

const stage = { w: 400, h: 800 };

describe("fit + clamp", () => {
  it("fits a landscape image to the width", () => {
    expect(fitSize({ w: 2000, h: 1000 }, stage)).toEqual({ w: 400, h: 200 });
  });
  it("at fit there is no pan", () => {
    expect(clampTransform({ scale: 1, x: 50, y: -30 }, { w: 400, h: 200 }, stage)).toEqual(IDENTITY);
  });
  it("zoomed pan stops at the image edges", () => {
    // 400 wide at 2x = 800 → 200px each side; 200 tall at 2x = 400 < 800 → no vertical pan.
    expect(clampTransform({ scale: 2, x: 999, y: 999 }, { w: 400, h: 200 }, stage)).toEqual({ scale: 2, x: 200, y: 0 });
  });
  it("scale is bounded", () => {
    expect(clampTransform({ scale: 9, x: 0, y: 0 }, { w: 400, h: 200 }, stage).scale).toBe(MAX_SCALE);
    expect(clampTransform({ scale: 0.3, x: 0, y: 0 }, { w: 400, h: 200 }, stage)).toEqual(IDENTITY);
  });
});

describe("zoom around a focal point", () => {
  it("keeps the point under the fingers fixed", () => {
    const focal = { x: 100, y: 50 };
    const t = zoomAround(IDENTITY, 2, focal);
    // image point under focal before: (focal - t)/s = (100,50); after: t' + p*s must equal focal
    expect(t.x + 100 * 2).toBeCloseTo(focal.x);
    expect(t.y + 50 * 2).toBeCloseTo(focal.y);
  });
  it("double tap toggles fit ↔ zoom", () => {
    const fitted = { w: 400, h: 600 };
    const z = doubleTapTarget(IDENTITY, { x: 0, y: 0 }, fitted, stage);
    expect(z.scale).toBeGreaterThan(1);
    expect(doubleTapTarget(z, { x: 0, y: 0 }, fitted, stage)).toEqual(IDENTITY);
  });
  it("원본 scale = natural pixels, never below fit", () => {
    expect(naturalSizeScale({ w: 1200, h: 600 }, { w: 400, h: 200 })).toBe(3);
    expect(naturalSizeScale({ w: 200, h: 100 }, { w: 400, h: 200 })).toBe(1);
  });
});

describe("drag decisions", () => {
  it("axis locks only past the slop", () => {
    expect(lockAxis(3, 2)).toBeNull();
    expect(lockAxis(20, 5)).toBe("x");
    expect(lockAxis(4, 30)).toBe("y");
  });
  it("pages past 20% or on a flick, never beyond the ends", () => {
    expect(pageDecision(-100, 0, 400, 0, 3)).toBe(1);
    expect(pageDecision(-30, 0, 400, 0, 3)).toBe(0);
    expect(pageDecision(-30, -0.8, 400, 0, 3)).toBe(1);
    expect(pageDecision(120, 0, 400, 0, 3)).toBe(0);
    expect(pageDecision(-120, 0, 400, 2, 3)).toBe(0);
    expect(pageDecision(120, 0, 400, 2, 3)).toBe(-1);
  });
  it("edges resist", () => {
    expect(rubberBand(100, 0, 3)).toBe(30);
    expect(rubberBand(-100, 1, 3)).toBe(-100);
  });
  it("dismiss on a long or fast downward drag", () => {
    expect(shouldDismiss(150, 0)).toBe(true);
    expect(shouldDismiss(60, 0.9)).toBe(true);
    expect(shouldDismiss(60, 0.1)).toBe(false);
  });
});
