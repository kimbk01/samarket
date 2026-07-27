import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCmRoomVisibleViewportSnapshot,
  CM_ROOM_NAVIGATION_GAP_PX,
  resolveCmRoomComposerBottomPaddingPx,
  resolveCmRoomKeyboardOpenFromViewport,
  resolveCmRoomTimelineHeightPx,
  resolveCmRoomVisibleViewportHeightPx,
  resolveCmRoomVisualViewportOverlayGapPx,
} from "@/lib/ui/cm-room-visible-viewport-contract";

describe("cm-room-visible-viewport-contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses visualViewport.height as visible height SSOT", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 640 },
    });
    expect(resolveCmRoomVisibleViewportHeightPx()).toBe(640);
  });

  it("detects keyboard open from overlay gap", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 700 },
    });
    expect(resolveCmRoomVisualViewportOverlayGapPx()).toBe(200);
    expect(resolveCmRoomKeyboardOpenFromViewport(900)).toBe(true);
  });

  it("detects keyboard open from adjustResize baseline shrink", () => {
    vi.stubGlobal("window", {
      innerHeight: 700,
      visualViewport: { offsetTop: 0, height: 700 },
    });
    expect(resolveCmRoomKeyboardOpenFromViewport(800)).toBe(true);
    expect(resolveCmRoomKeyboardOpenFromViewport(700)).toBe(false);
  });

  it("timeline height = visible - top chrome - footer chrome", () => {
    expect(
      resolveCmRoomTimelineHeightPx({
        visibleHeightPx: 800,
        timelineTopOffsetPx: 56,
        footerChromeHeightPx: 52,
      })
    ).toBe(692);
  });

  it("composer padding null when keyboard closed → CSS safe-bottom", () => {
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: false })).toBeNull();
  });

  it("composer padding 0 when keyboard open on Android-style path", () => {
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
  });

  it("does not double apply iOS keyboard height after shell is sized to visualViewport", () => {
    // Legacy callers passed large overlay values; padding must stay 0 (shell height = vv.height).
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
    expect(resolveCmRoomVisualViewportOverlayGapPx).toBeTypeOf("function");
  });

  it("composer padding toggles closed→open→closed without leftover overlay", () => {
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: false })).toBeNull();
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: false })).toBeNull();
  });

  it("large visualViewport overlay gap does not become composer padding", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 600 },
    });
    expect(resolveCmRoomVisualViewportOverlayGapPx()).toBe(300);
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
  });

  it("baseline advances when keyboard closed", () => {
    vi.stubGlobal("window", {
      innerHeight: 820,
      visualViewport: { offsetTop: 0, height: 820 },
    });
    const snap = buildCmRoomVisibleViewportSnapshot(800);
    expect(snap.keyboardOpen).toBe(false);
    expect(snap.baselineClosedHeightPx).toBe(820);
  });

  it("navigation gap constant is 48px for OneUI dedupe contract", () => {
    expect(CM_ROOM_NAVIGATION_GAP_PX).toBe(48);
  });
});
