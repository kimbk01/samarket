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
  getIosFormKeyboardViewportConsumerCount,
} from "@/lib/ui/ios-form-keyboard-viewport-store";
import { SAMARKET_SHELL_KEYBOARD_EVENT } from "@/lib/platform/samarket-shell-keyboard";
import {
  applyDibayIosFormKeyboardRootVars,
  clearDibayIosFormKeyboardRootVars,
  isDibayIosFormKeyboardBandActive,
  isDibayKeyboardResizeFocusTarget,
} from "@/lib/ui/dibay-ios-form-keyboard-dom";

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
    expect(band.heightPx).toBe(520);
    expect(band.insetCssPx).toBe(240);
  });

  it("native-only fallback when vv has not shrunk yet", () => {
    const band = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 800, offsetTop: 0 },
      nativeInsetCssPx: 300,
    });
    expect(band.bandAuthority).toBe("nativeInset");
    expect(band.heightPx).toBe(500);
  });

  it("keyboard hide restores closed layout band", () => {
    const closed = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 800, offsetTop: 0 },
      nativeInsetCssPx: 0,
    });
    expect(closed.keyboardOpen).toBe(false);
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
    expect(iosFormVisibleBandsEqual(a, { ...a })).toBe(true);
    expect(iosFormVisibleBandsEqual(a, { ...a, heightPx: 499 })).toBe(false);
  });
});

describe("dibay-ios-form-keyboard-dom", () => {
  afterEach(() => {
    clearDibayIosFormKeyboardRootVars(document.documentElement);
  });

  it("writes and clears root band attrs without double height math", () => {
    const root = document.documentElement;
    const open = resolveIosFormVisibleBandPx({
      isIosWebKit: true,
      cmRoomShellPresent: false,
      layoutHeightPx: 800,
      visualViewport: { height: 500, offsetTop: 0 },
      nativeInsetCssPx: 0,
    });
    applyDibayIosFormKeyboardRootVars(root, open);
    expect(isDibayIosFormKeyboardBandActive(document)).toBe(true);
    expect(root.style.getPropertyValue("--dibay-vv-height")).toBe("500px");
    expect(root.style.getPropertyValue("--app-visible-height")).toBe("500px");
    clearDibayIosFormKeyboardRootVars(root);
    expect(isDibayIosFormKeyboardBandActive(document)).toBe(false);
  });

  it("focus target skips CM room composer fields", () => {
    const room = document.createElement("div");
    room.setAttribute("data-cm-room", "");
    room.className = "cm-room-shell";
    const ta = document.createElement("textarea");
    room.appendChild(ta);
    document.body.appendChild(room);
    expect(isDibayKeyboardResizeFocusTarget(ta)).toBe(false);
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(isDibayKeyboardResizeFocusTarget(input)).toBe(true);
    room.remove();
    input.remove();
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

    const release = acquireIosFormKeyboardViewport(() => {});
    expect(getIosFormKeyboardViewportConsumerCount()).toBe(1);

    window.samarketShell = { keyboardBottomInsetCssPx: 280 };
    window.dispatchEvent(
      new CustomEvent(SAMARKET_SHELL_KEYBOARD_EVENT, {
        detail: { bottomInsetCssPx: 280, visible: true, durationMs: 250 },
      })
    );

    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          expect(getIosFormKeyboardViewportBand().keyboardOpen).toBe(true);
          expect(getIosFormKeyboardViewportBand().bandAuthority).toBe("nativeInset");

          window.samarketShell = { keyboardBottomInsetCssPx: 0 };
          window.dispatchEvent(
            new CustomEvent(SAMARKET_SHELL_KEYBOARD_EVENT, {
              detail: { bottomInsetCssPx: 0, visible: false, durationMs: 250 },
            })
          );
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              expect(getIosFormKeyboardViewportBand().keyboardOpen).toBe(false);
              release();
              expect(getIosFormKeyboardViewportConsumerCount()).toBe(0);
              resolve();
            });
          });
        });
      });
    });
  });

  it("listener cleanup stops store when last consumer releases", () => {
    const releaseA = acquireIosFormKeyboardViewport(vi.fn());
    const releaseB = acquireIosFormKeyboardViewport(vi.fn());
    expect(getIosFormKeyboardViewportConsumerCount()).toBe(2);
    releaseA();
    releaseB();
    expect(getIosFormKeyboardViewportConsumerCount()).toBe(0);
  });
});
