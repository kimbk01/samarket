// @vitest-environment jsdom
/**
 * INAPP-07 — Android hardware back closes only the top-most overlay.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setOverlayBackListenerDriverForTests,
  enableAndroidHardwareBackOwner,
  handleOverlayHardwareBack,
  isOverlayBackListenerInstalled,
  overlayBackStackDepth,
  pushOverlayBackEntry,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

function fakeDriver() {
  const state = {
    installs: 0,
    removes: 0,
    minimizes: 0,
    onBack: null as null | ((ev: { canGoBack?: boolean }) => void),
  };
  const driver: OverlayBackListenerDriver = {
    minimize() {
      state.minimizes += 1;
    },
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

  describe("push-tap-entry P2 — Android 뒤로 상시 담당", () => {
    afterEach(() => {
      delete (window as unknown as { navigation?: unknown }).navigation;
      vi.restoreAllMocks();
    });

    function setNavigationCanGoBack(v: boolean | undefined): void {
      (window as unknown as { navigation?: unknown }).navigation = v === undefined ? undefined : { canGoBack: v };
    }

    it("담당 켜면 오버레이 없어도 리스너 1개, 끄면 제거", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      const off = enableAndroidHardwareBackOwner();
      expect(state.installs).toBe(1);
      const release = pushOverlayBackEntry(() => {});
      release();
      expect(state.removes).toBe(0);
      off();
      expect(state.removes).toBe(1);
      expect(isOverlayBackListenerInstalled()).toBe(false);
    });

    it("오버레이가 있으면 그것만 닫음(기록 뒤로·앱 내리기 없음)", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      enableAndroidHardwareBackOwner();
      const close = vi.fn();
      pushOverlayBackEntry(close);
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      setNavigationCanGoBack(true);
      state.onBack?.({ canGoBack: true });
      expect(close).toHaveBeenCalledTimes(1);
      expect(back).not.toHaveBeenCalled();
      expect(state.minimizes).toBe(0);
    });

    it("웹 기록이 있으면 history.back — 네이티브 canGoBack 이 false 여도(건너뛰기 규칙)", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      enableAndroidHardwareBackOwner();
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      setNavigationCanGoBack(true);
      state.onBack?.({ canGoBack: false });
      expect(back).toHaveBeenCalledTimes(1);
      expect(state.minimizes).toBe(0);
    });

    it("웹 기록이 없으면 앱 내리기", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      enableAndroidHardwareBackOwner();
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      setNavigationCanGoBack(false);
      state.onBack?.({ canGoBack: false });
      expect(back).not.toHaveBeenCalled();
      expect(state.minimizes).toBe(1);
    });

    it("Navigation API 없으면 네이티브 canGoBack 으로 판단", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      enableAndroidHardwareBackOwner();
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      setNavigationCanGoBack(undefined);
      state.onBack?.({ canGoBack: true });
      expect(back).toHaveBeenCalledTimes(1);
    });

    it("담당이 꺼진 상태(오버레이만)의 경합 호출은 앱을 내리지 않음", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      const release = pushOverlayBackEntry(() => {});
      const onBack = state.onBack;
      release();
      setNavigationCanGoBack(false);
      onBack?.({ canGoBack: false });
      expect(state.minimizes).toBe(0);
    });

    it("메인 앱 공급자 트리에 담당 컴포넌트 1개", () => {
      const tree = readFileSync("components/layout/MainAppProviderTree.tsx", "utf8");
      expect(tree.match(/<AndroidHardwareBackOwner \/>/g)?.length).toBe(1);
    });
  });
});
