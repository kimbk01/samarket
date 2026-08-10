import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFormKeyboardViewportSnapshot,
  ensureFormFocusVisibleInScrollRoot,
  isFormLayoutAlignedWithVisualViewport,
  resolveFormEffectiveBottomInsetPx,
  resolveFormKeyboardOcclusionInsetPx,
  resolveFormKeyboardOpenFromViewport,
  resolveFormVisualViewportOverlayGapPx,
} from "@/lib/ui/form-keyboard-viewport-contract";

describe("form-keyboard-viewport-contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Android adjustResize: layout aligned → occlusion 0 (no double pad)", () => {
    vi.stubGlobal("window", {
      innerHeight: 640,
      visualViewport: { offsetTop: 0, height: 640 },
    });
    expect(isFormLayoutAlignedWithVisualViewport()).toBe(true);
    expect(resolveFormKeyboardOcclusionInsetPx({ nativeShellInsetPx: 280 })).toBe(0);
    expect(
      resolveFormEffectiveBottomInsetPx({
        keyboardOpen: true,
        keyboardOcclusionInset: 0,
        safeBottom: 48,
      })
    ).toBe(0);
  });

  it("iOS overlay: occlusion from visualViewport gap; open inset is occlusion only", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 600 },
    });
    expect(resolveFormVisualViewportOverlayGapPx()).toBe(300);
    expect(isFormLayoutAlignedWithVisualViewport()).toBe(false);
    expect(resolveFormKeyboardOcclusionInsetPx()).toBe(300);
    expect(
      resolveFormEffectiveBottomInsetPx({
        keyboardOpen: true,
        keyboardOcclusionInset: 300,
        safeBottom: 34,
      })
    ).toBe(300);
  });

  it("closed keyboard uses safeBottom only", () => {
    expect(
      resolveFormEffectiveBottomInsetPx({
        keyboardOpen: false,
        keyboardOcclusionInset: 0,
        safeBottom: 34,
      })
    ).toBe(34);
  });

  it("never sums safeBottom + occlusion into effectiveBottomInset", () => {
    const open = resolveFormEffectiveBottomInsetPx({
      keyboardOpen: true,
      keyboardOcclusionInset: 200,
      safeBottom: 48,
    });
    expect(open).toBe(200);
    expect(open).not.toBe(248);
  });

  it("detects keyboard open from overlay or adjustResize shrink", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 700 },
    });
    expect(resolveFormKeyboardOpenFromViewport(900)).toBe(true);

    vi.stubGlobal("window", {
      innerHeight: 700,
      visualViewport: { offsetTop: 0, height: 700 },
    });
    expect(resolveFormKeyboardOpenFromViewport(800)).toBe(true);
    expect(resolveFormKeyboardOpenFromViewport(700)).toBe(false);
  });

  it("build snapshot: Android open → effectiveBottomInset 0", () => {
    vi.stubGlobal("window", {
      innerHeight: 640,
      visualViewport: { offsetTop: 0, height: 640 },
    });
    const snap = buildFormKeyboardViewportSnapshot({
      baselineClosedHeightPx: 900,
      safeBottomPx: 48,
      nativeShellInsetPx: null,
    });
    expect(snap.keyboardOpen).toBe(true);
    expect(snap.keyboardOcclusionInset).toBe(0);
    expect(snap.effectiveBottomInset).toBe(0);
    expect(snap.effectiveViewportBottom).toBe(640);
  });

  it("focus visibility scrolls only when bottom-occluded", () => {
    const focused = {
      getBoundingClientRect: () => ({ bottom: 500, top: 460, height: 40, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
    } as HTMLElement;
    const scrollRoot = { scrollTop: 0 } as HTMLElement;
    expect(
      ensureFormFocusVisibleInScrollRoot({
        focused,
        scrollRoot,
        effectiveViewportBottom: 600,
        effectiveViewportTop: 0,
        focusGapPx: 8,
      })
    ).toBe(0);
    expect(scrollRoot.scrollTop).toBe(0);

    expect(
      ensureFormFocusVisibleInScrollRoot({
        focused,
        scrollRoot,
        effectiveViewportBottom: 480,
        effectiveViewportTop: 0,
        focusGapPx: 8,
      })
    ).toBe(28);
    expect(scrollRoot.scrollTop).toBe(28);
  });

  it("focus visibility corrects top clipping without jumping to center", () => {
    const focused = {
      getBoundingClientRect: () => ({
        bottom: 120,
        top: 40,
        height: 80,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLElement;
    const scrollRoot = { scrollTop: 200 } as HTMLElement;
    const delta = ensureFormFocusVisibleInScrollRoot({
      focused,
      scrollRoot,
      effectiveViewportBottom: 700,
      effectiveViewportTop: 100,
      focusGapPx: 8,
    });
    expect(delta).toBeLessThan(0);
    expect(scrollRoot.scrollTop).toBe(200 + delta);
    // topLimit = 100 + 8 → delta = floor(40 - 108) = -68
    expect(Math.abs(delta)).toBe(68);
  });

  it("CASE D: tiny usable band relaxes chrome top enough for focused height", async () => {
    vi.stubGlobal("window", {
      innerHeight: 280,
      visualViewport: { offsetTop: 0, height: 280 },
    });
    const chrome = {
      getBoundingClientRect: () => ({
        bottom: 180,
        top: 140,
        height: 40,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLElement;
    const { resolveFormEffectiveViewportTopPx } = await import(
      "@/lib/ui/form-keyboard-viewport-contract"
    );
    const top = resolveFormEffectiveViewportTopPx({
      stickyChromeEl: chrome,
      effectiveViewportBottom: 280,
      focusedHeightPx: 40,
    });
    expect(top).toBeLessThan(180);
    expect(280 - top).toBeGreaterThanOrEqual(120);
  });

  it("CASE D tall textarea: prioritize bottom/caret, allow top clip", () => {
    const focused = {
      getBoundingClientRect: () => ({
        bottom: 400,
        top: 100,
        height: 300,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLElement;
    const scrollRoot = { scrollTop: 0 } as HTMLElement;
    const delta = ensureFormFocusVisibleInScrollRoot({
      focused,
      scrollRoot,
      effectiveViewportBottom: 280,
      effectiveViewportTop: 160,
      focusGapPx: 8,
    });
    // bottomLimit=272 → scroll so bottom enters band
    expect(delta).toBe(128);
    expect(scrollRoot.scrollTop).toBe(128);
  });

  it("CASE D tall textarea: ease down when caret line is under sticky chrome", () => {
    // Usable band 77..168; tall box bottom already in band but caret under chrome.
    const focused = {
      getBoundingClientRect: () => ({
        bottom: 103,
        top: 3,
        height: 100,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLElement;
    const scrollRoot = { scrollTop: 300 } as HTMLElement;
    const delta = ensureFormFocusVisibleInScrollRoot({
      focused,
      scrollRoot,
      effectiveViewportBottom: 176,
      effectiveViewportTop: 69,
      focusGapPx: 8,
    });
    expect(delta).toBeLessThan(0);
    expect(scrollRoot.scrollTop).toBe(300 + delta);
  });
});
