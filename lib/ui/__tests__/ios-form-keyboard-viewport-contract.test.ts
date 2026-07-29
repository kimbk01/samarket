/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  iosFormVisibleBandsEqual,
  isCmRoomKeyboardOwnerPresent,
  resolveDibayKeyboardLayoutOwner,
  resolveIosFormVisibleBandPx,
  shouldApplyIosFormLayoutWriter,
} from "@/lib/ui/ios-form-keyboard-viewport-contract";
import {
  __resetIosFormKeyboardViewportStoreForTests,
  acquireIosFormKeyboardViewport,
  getIosFormKeyboardViewportBand,
} from "@/lib/ui/ios-form-keyboard-viewport-store";
import { SAMARKET_SHELL_KEYBOARD_EVENT } from "@/lib/platform/samarket-shell-keyboard";

describe("ios-form-keyboard-viewport-contract", () => {
  it("Android / non-iOS never applies form writer geometry", () => {
    const band = resolveIosFormVisibleBandPx({
      isIosWebKit: false,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 500, offsetTop: 0 },
      nativeInsetCssPx: 300,
    });
    expect(band.keyboardOpen).toBe(false);
    expect(band.owner).toBe("android_adjust_resize");
    expect(shouldApplyIosFormLayoutWriter(band)).toBe(false);
  });

  it("CM room shell present → form writer disabled (owner cm_room_vv_band)", () => {
    const band = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: true,
      layoutHeightPx: 800,
      visualViewport: { height: 500, offsetTop: 80 },
      nativeInsetCssPx: 280,
    });
    expect(band.owner).toBe("cm_room_vv_band");
    expect(shouldApplyIosFormLayoutWriter(band)).toBe(false);
    expect(band.keyboardOpen).toBe(false);
  });

  it("prefers visualViewport band and does not subtract nativeInset from vv.height", () => {
    const band = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 520, offsetTop: 40 },
      nativeInsetCssPx: 280,
    });
    expect(band.keyboardOpen).toBe(true);
    expect(band.bandAuthority).toBe("visualViewport");
    expect(band.topPx).toBe(40);
    expect(band.heightPx).toBe(520);
    // inset for probes only — height is NOT 520-280
    expect(band.insetCssPx).toBe(240);
    expect(band.heightPx + band.topPx).toBe(560);
  });

  it("native-only fallback when vv has not shrunk yet", () => {
    const band = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 800, offsetTop: 0 },
      nativeInsetCssPx: 300,
    });
    expect(band.keyboardOpen).toBe(true);
    expect(band.bandAuthority).toBe("nativeInset");
    expect(band.topPx).toBe(0);
    expect(band.heightPx).toBe(500);
    expect(band.insetCssPx).toBe(300);
  });

  it("keyboard hide restores closed layout band", () => {
    const open = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 500, offsetTop: 0 },
      nativeInsetCssPx: 300,
    });
    expect(open.keyboardOpen).toBe(true);
    const closed = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 800, offsetTop: 0 },
      nativeInsetCssPx: 0,
    });
    expect(closed.keyboardOpen).toBe(false);
    expect(closed.heightPx).toBe(800);
    expect(closed.insetCssPx).toBe(0);
  });

  it("detects CM room shell in document", () => {
    const doc = document.implementation.createHTMLDocument("");
    expect(isCmRoomKeyboardOwnerPresent(doc)).toBe(false);
    const shell = doc.createElement("div");
    shell.setAttribute("data-cm-room", "");
    shell.className = "cm-room-shell";
    doc.body.appendChild(shell);
    expect(isCmRoomKeyboardOwnerPresent(doc)).toBe(true);
  });

  it("resolveDibayKeyboardLayoutOwner gates CM room over form", () => {
    expect(
      resolveDibayKeyboardLayoutOwner({
        isIosWebKit: true,
        cmRoomShellPresent: true,
        formSurfaceActive: true,
        keyboardOpen: true,
      })
    ).toBe("cm_room_vv_band");
  });

  it("bandsEqual dedupes identical snapshots", () => {
    const a = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 500, offsetTop: 0 },
      nativeInsetCssPx: 0,
    });
    const b = { ...a };
    expect(iosFormVisibleBandsEqual(a, b)).toBe(true);
    expect(iosFormVisibleBandsEqual(a, { ...a, heightPx: 499 })).toBe(false);
  });
});

describe("ios-form-keyboard-viewport-store", () => {
  afterEach(() => {
    __resetIosFormKeyboardViewportStoreForTests();
    delete (window as Window & { samarketShell?: unknown }).samarketShell;
    vi.unstubAllGlobals();
  });

  it("receives native keyboard inset via samarket:shell-keyboard and restores 0 on hide", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { height: 800, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });

    const seen: number[] = [];
    const release = acquireIosFormKeyboardViewport((band) => {
      seen.push(band.insetCssPx);
    });

    window.samarketShell = { keyboardBottomInsetCssPx: 280 };
    window.dispatchEvent(
      new CustomEvent(SAMARKET_SHELL_KEYBOARD_EVENT, {
        detail: { bottomInsetCssPx: 280, visible: true, durationMs: 250 },
      })
    );

    // double rAF in store — flush
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          expect(getIosFormKeyboardViewportBand().keyboardOpen).toBe(true);
          expect(getIosFormKeyboardViewportBand().bandAuthority).toBe("nativeInset");
          expect(getIosFormKeyboardViewportBand().heightPx).toBe(window.innerHeight - 280);

          window.samarketShell = { keyboardBottomInsetCssPx: 0 };
          window.dispatchEvent(
            new CustomEvent(SAMARKET_SHELL_KEYBOARD_EVENT, {
              detail: { bottomInsetCssPx: 0, visible: false, durationMs: 250 },
            })
          );
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              expect(getIosFormKeyboardViewportBand().keyboardOpen).toBe(false);
              expect(getIosFormKeyboardViewportBand().insetCssPx).toBe(0);
              release();
              resolve();
            });
          });
        });
      });
    });
  });

  it("listener cleanup stops store when last consumer releases", () => {
    const a = vi.fn();
    const b = vi.fn();
    const releaseA = acquireIosFormKeyboardViewport(a);
    const releaseB = acquireIosFormKeyboardViewport(b);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    releaseA();
    releaseB();
    // after reset path via last release, band is closed
    expect(getIosFormKeyboardViewportBand().keyboardOpen).toBe(false);
  });
});
