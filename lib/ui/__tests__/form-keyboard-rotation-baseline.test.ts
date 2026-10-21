/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { buildFormKeyboardViewportSnapshot } from "@/lib/ui/form-keyboard-viewport-contract";

/**
 * KB-04 — keyboard-closed baseline must not survive a layout-width change (rotation / split-screen).
 * Input parity HARD LOCK: DO NOT reuse portrait→landscape geometry.
 */
function setViewport(width: number, innerH: number, vvH: number, offsetTop = 0) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: innerH });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height: vvH, width, offsetTop, addEventListener() {}, removeEventListener() {} },
  });
}

describe("form keyboard baseline per layout width (KB-04)", () => {
  it("portrait → landscape with keyboard closed stays closed and keeps safe-bottom", () => {
    setViewport(800, 1280, 1280);
    const s1 = buildFormKeyboardViewportSnapshot({ baselineClosedHeightPx: 0, safeBottomPx: 24 });
    expect(s1.keyboardOpen).toBe(false);

    setViewport(1280, 800, 800);
    const s2 = buildFormKeyboardViewportSnapshot({
      baselineClosedHeightPx: s1.baselineClosedHeightPx,
      baselineLayoutWidthPx: s1.baselineLayoutWidthPx,
      safeBottomPx: 24,
    });
    expect(s2.keyboardOpen).toBe(false);
    expect(s2.effectiveBottomInset).toBe(24);
    expect(s2.baselineClosedHeightPx).toBe(800);
  });

  it("after rotation a real Android-resize keyboard is still detected", () => {
    setViewport(800, 1280, 1280);
    const s1 = buildFormKeyboardViewportSnapshot({ baselineClosedHeightPx: 0, safeBottomPx: 24 });
    setViewport(1280, 800, 800);
    const s2 = buildFormKeyboardViewportSnapshot({
      baselineClosedHeightPx: s1.baselineClosedHeightPx,
      baselineLayoutWidthPx: s1.baselineLayoutWidthPx,
      safeBottomPx: 24,
    });
    setViewport(1280, 480, 480);
    const s3 = buildFormKeyboardViewportSnapshot({
      baselineClosedHeightPx: s2.baselineClosedHeightPx,
      baselineLayoutWidthPx: s2.baselineLayoutWidthPx,
      safeBottomPx: 24,
    });
    expect(s3.keyboardOpen).toBe(true);
    expect(s3.effectiveBottomInset).toBe(0);
  });

  it("same width: unchanged behaviour (keyboard detected, closes back)", () => {
    setViewport(390, 844, 844);
    const a = buildFormKeyboardViewportSnapshot({ baselineClosedHeightPx: 0, safeBottomPx: 34 });
    setViewport(390, 520, 520);
    const b = buildFormKeyboardViewportSnapshot({
      baselineClosedHeightPx: a.baselineClosedHeightPx,
      baselineLayoutWidthPx: a.baselineLayoutWidthPx,
      safeBottomPx: 34,
    });
    expect(b.keyboardOpen).toBe(true);
    setViewport(390, 844, 844);
    const c = buildFormKeyboardViewportSnapshot({
      baselineClosedHeightPx: b.baselineClosedHeightPx,
      baselineLayoutWidthPx: b.baselineLayoutWidthPx,
      safeBottomPx: 34,
    });
    expect(c.keyboardOpen).toBe(false);
    expect(c.effectiveBottomInset).toBe(34);
  });
});
