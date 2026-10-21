import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetCmRoomVisibleViewportWidthMemoryForTests,
  buildCmRoomVisibleViewportSnapshot,
  CM_ROOM_NAVIGATION_GAP_PX,
  resolveCmRoomComposerBottomPaddingPx,
  resolveCmRoomKeyboardOpenFromViewport,
  resolveCmRoomShellVisualFramePx,
  resolveCmRoomVisibleViewportHeightPx,
  resolveCmRoomVisualViewportOverlayGapPx,
  resolveIosMessengerPageVisualBandPx,
} from "@/lib/ui/cm-room-visible-viewport-contract";

describe("cm-room-visible-viewport-contract", () => {
  afterEach(() => {
    __resetCmRoomVisibleViewportWidthMemoryForTests();
    vi.unstubAllGlobals();
  });

  it("uses visualViewport.height as visible height SSOT", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 640 },
    });
    expect(resolveCmRoomVisibleViewportHeightPx()).toBe(640);
  });

  it("shell visual frame includes offsetTop for iOS visible band", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 280, height: 520 },
    });
    expect(resolveCmRoomShellVisualFramePx()).toEqual({
      heightPx: 520,
      offsetTopPx: 280,
      visualBottomPx: 800,
    });
  });

  it("iOS messenger-page band pins on keyboard open (Telegram-style); clears when closed", () => {
    const frame = { heightPx: 520, offsetTopPx: 280, visualBottomPx: 800 };
    expect(resolveIosMessengerPageVisualBandPx({ keyboardOpen: true, frame })).toEqual({
      topPx: 280,
      heightPx: 520,
    });
    expect(resolveIosMessengerPageVisualBandPx({ keyboardOpen: false, frame })).toBeNull();
    expect(
      resolveIosMessengerPageVisualBandPx({
        keyboardOpen: true,
        frame: { heightPx: 640, offsetTopPx: 0, visualBottomPx: 640 },
      })
    ).toEqual({ topPx: 0, heightPx: 640 });
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

  it("composer padding null when keyboard closed → CSS safe-bottom", () => {
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: false })).toBeNull();
  });

  it("composer padding 0 when keyboard open (Android contract; no iOS overlay double apply)", () => {
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
  });

  it("does not double apply overlay gap after shell sized to visualViewport", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 0, height: 600 },
    });
    expect(resolveCmRoomVisualViewportOverlayGapPx()).toBe(300);
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
  });

  it("composer padding toggles closed→open→closed", () => {
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: false })).toBeNull();
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: true })).toBe(0);
    expect(resolveCmRoomComposerBottomPaddingPx({ keyboardOpen: false })).toBeNull();
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
  it("KB-04: portrait baseline does not mark landscape (keyboard closed) as open", () => {
    vi.stubGlobal("window", { innerWidth: 800, innerHeight: 1280, visualViewport: { offsetTop: 0, height: 1280 } });
    const p = buildCmRoomVisibleViewportSnapshot(0);
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 800, visualViewport: { offsetTop: 0, height: 800 } });
    const l = buildCmRoomVisibleViewportSnapshot(p.baselineClosedHeightPx, p.baselineLayoutWidthPx);
    expect(l.keyboardOpen).toBe(false);
    expect(l.baselineClosedHeightPx).toBe(800);
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 480, visualViewport: { offsetTop: 0, height: 480 } });
    const k = buildCmRoomVisibleViewportSnapshot(l.baselineClosedHeightPx, l.baselineLayoutWidthPx);
    expect(k.keyboardOpen).toBe(true);
  });

  it("KB-04: same width keeps the baseline (keyboard shrink detected)", () => {
    vi.stubGlobal("window", { innerWidth: 390, innerHeight: 520, visualViewport: { offsetTop: 0, height: 520 } });
    const k = buildCmRoomVisibleViewportSnapshot(844, 390);
    expect(k.keyboardOpen).toBe(true);
    expect(k.baselineClosedHeightPx).toBe(844);
  });

  describe("A: rotation with the keyboard open (Android resize)", () => {
    const at = (w: number, h: number) =>
      vi.stubGlobal("window", { innerWidth: w, innerHeight: h, visualViewport: { offsetTop: 0, height: h } });

    it("stays open across portrait → landscape, then the first closed measure replaces the estimate", () => {
      at(400, 800);
      let s = buildCmRoomVisibleViewportSnapshot(0);
      at(400, 500);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(true);
      at(800, 150);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(true);
      at(800, 380); // IME closed; estimate (400) is not trusted as measured — closed, re-measured
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(false);
      expect(s.baselineClosedHeightPx).toBe(380);
    });

    it("rotation that closed the keyboard is closed at once", () => {
      at(400, 800);
      let s = buildCmRoomVisibleViewportSnapshot(0);
      at(400, 500);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      at(800, 400);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(false);
      expect(s.baselineClosedHeightPx).toBe(400);
    });

    it("returning to a seen orientation reuses its measured closed height", () => {
      at(400, 800);
      let s = buildCmRoomVisibleViewportSnapshot(0);
      at(800, 400);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      at(800, 180);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(true);
      at(400, 500); // back to portrait with the IME up → measured 800, open
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(true);
      expect(s.baselineClosedHeightPx).toBe(800);
      at(400, 800);
      s = buildCmRoomVisibleViewportSnapshot(s.baselineClosedHeightPx, s.baselineLayoutWidthPx);
      expect(s.keyboardOpen).toBe(false);
    });
  });
});
