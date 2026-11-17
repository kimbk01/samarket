// @vitest-environment jsdom
/**
 * INAPP-07 — Android hardware back closes only the top-most overlay.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setOverlayBackListenerDriverForTests,
  minimizeAppForBack,
  setRootBackAction,
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
    install(onBack) {
      state.installs += 1;
      state.onBack = onBack;
      return () => {
        state.removes += 1;
        state.onBack = null;
      };
    },
    minimize() {
      state.minimizes += 1;
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

  describe("D1·F4 — 첫 화면 ◁ (2026-11-17)", () => {
    it("첫 화면 처리가 지정되면 리스너를 켜고, 오버레이가 없으면 그 처리를 한다(앱 내리기)", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      setRootBackAction(minimizeAppForBack);
      expect(isOverlayBackListenerInstalled()).toBe(true);
      state.onBack?.({ canGoBack: true }); // 남은 기록이 있어도 첫 화면 규칙이 이긴다(Android 표준)
      expect(state.minimizes).toBe(1);
      expect(back).not.toHaveBeenCalled();
      setRootBackAction(null);
      expect(isOverlayBackListenerInstalled()).toBe(false);
      back.mockRestore();
    });

    it("첫 화면이어도 열린 오버레이가 먼저 — 오버레이만 닫는다", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      const goHome = vi.fn();
      setRootBackAction(goHome);
      const close = vi.fn();
      const release = pushOverlayBackEntry(close);
      state.onBack?.({ canGoBack: false });
      expect(close).toHaveBeenCalledTimes(1);
      expect(goHome).not.toHaveBeenCalled();
      expect(state.minimizes).toBe(0);
      release();
    });

    it("첫 화면이 아니고 오버레이도 없으면(경합) 이전 화면 → 없으면 앱 내리기", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const release = pushOverlayBackEntry(() => {});
      const onBack = state.onBack;
      release();
      onBack?.({ canGoBack: true });
      expect(back).toHaveBeenCalledTimes(1);
      onBack?.({ canGoBack: false });
      expect(state.minimizes).toBe(1);
      back.mockRestore();
    });

    it("처리 중(busy) 오버레이는 첫 화면에서도 삼킨다", () => {
      const { driver, state } = fakeDriver();
      __setOverlayBackListenerDriverForTests(driver);
      setRootBackAction(minimizeAppForBack);
      const release = pushOverlayBackEntry(null);
      state.onBack?.({ canGoBack: false });
      expect(state.minimizes).toBe(0);
      release();
    });
  });

  it("DibayOverlayRoot — ◁ 삼킴은 backDismissible(기본 dismissible) 이 false 일 때만", () => {
    const root = readFileSync("components/ui/dibay-overlay/DibayOverlayRoot.tsx", "utf8");
    expect(root).toContain("const closesOnBack = backDismissible ?? dismissible;");
    expect(root).toContain("useOverlayHardwareBack(open && Boolean(onClose), closesOnBack && onClose ? onClose : null);");
  });

  it("D6 — X·취소가 있는 시트는 ◁ 로 닫힌다(바깥 탭 잠금과 분리)", () => {
    const files: Array<[string, string]> = [
      ["components/ui/dibay-overlay/DibayFullSheet.tsx", "backDismissible\n"],
      ["components/write/shared/ImageEditorModal.tsx", "backDismissible\n"],
      ["components/chats/ChatMobileImagePickerSheet.tsx", "backDismissible\n"],
      ["components/community-messenger/MessengerPillarLeaveConfirmSheet.tsx", "backDismissible={!busy}"],
      ["components/support/SupportModalHost.tsx", "backDismissible={!submitting}"],
    ];
    for (const [file, needle] of files) {
      expect(readFileSync(file, "utf8"), file).toContain(needle);
    }
  });
});

