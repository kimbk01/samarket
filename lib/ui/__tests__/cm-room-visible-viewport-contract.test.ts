import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
});
