/**
 * INAPP-07 — Android hardware back closes only the top-most overlay.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setOverlayBackListenerDriverForTests,
  handleOverlayHardwareBack,
  isOverlayBackListenerInstalled,
  overlayBackStackDepth,
  pushOverlayBackEntry,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

function fakeDriver() {
  const state = { installs: 0, removes: 0, onBack: null as null | ((ev: { canGoBack?: boolean }) => void) };
  const driver: OverlayBackListenerDriver = {
    install(onBack) {
      state.installs += 1;
      state.onBack = onBack;
      return () => {
        state.removes += 1;
        state.onBack = null;
      };
    },
  };
  return { driver, state };
}

afterEach(() => __setOverlayBackListenerDriverForTests(null));

describe("overlay back stack (INAPP-07)", () => {
  it("no overlay → no native listener, back is not consumed", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    expect(isOverlayBackListenerInstalled()).toBe(false);
    expect(handleOverlayHardwareBack()).toBe(false);
    expect(state.installs).toBe(0);
  });

  it("one listener while overlays are open; removed when the last one closes", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const releaseA = pushOverlayBackEntry(() => {});
    const releaseB = pushOverlayBackEntry(() => {});
    expect(state.installs).toBe(1);
    expect(isOverlayBackListenerInstalled()).toBe(true);
    releaseA();
    expect(state.removes).toBe(0);
    releaseB();
    expect(state.removes).toBe(1);
    expect(isOverlayBackListenerInstalled()).toBe(false);
    expect(overlayBackStackDepth()).toBe(0);
  });

  it("back closes only the top-most overlay", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const closeSheet = vi.fn();
    const closeDialog = vi.fn();
    const releaseSheet = pushOverlayBackEntry(closeSheet);
    const releaseDialog = pushOverlayBackEntry(() => {
      closeDialog();
      releaseDialog();
    });

    state.onBack?.({ canGoBack: true });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();

    state.onBack?.({ canGoBack: true });
    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(closeDialog).toHaveBeenCalledTimes(1);
    releaseSheet();
  });

  it("closing a lower overlay first keeps the top-most one on top", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const lower = vi.fn();
    const upper = vi.fn();
    const releaseLower = pushOverlayBackEntry(lower);
    const releaseUpper = pushOverlayBackEntry(upper);
    releaseLower();
    state.onBack?.({});
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    releaseUpper();
  });

  it("non-dismissible (busy) overlay swallows back instead of navigating", () => {
    const { driver } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const release = pushOverlayBackEntry(null);
    expect(handleOverlayHardwareBack()).toBe(true);
    release();
  });

  it("DibayOverlayRoot registers with the stack only (no direct native listener / history hijack)", () => {
    const root = readFileSync("components/ui/dibay-overlay/DibayOverlayRoot.tsx", "utf8");
    const executable = root.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(executable).toContain("useOverlayHardwareBack(");
    expect(executable).not.toContain("addListener");
    expect(executable).not.toContain("pushState");
    const host = readFileSync("components/platform-popup/GlobalPopupHost.tsx", "utf8");
    expect(host).not.toContain('addListener("backButton"');
    // Exactly one place in the app installs the native back listener.
    const stack = readFileSync("lib/ui/overlay-back-stack.ts", "utf8");
    expect(stack.match(/addListener\("backButton"/g)?.length).toBe(1);
  });
});
