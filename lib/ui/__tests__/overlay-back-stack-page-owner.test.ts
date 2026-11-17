// @vitest-environment jsdom
/**
 * P5 (부록 P5 §B3-5) — 오버레이 뒤로 스택의 「페이지 뒤로 주인」 슬롯.
 * 순서 = 오버레이 → 페이지 주인 → 결함 E → canGoBack, 리스너 1개, 등록 동안만 설치.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setOverlayBackListenerDriverForTests,
  hasPageBackOwner,
  isOverlayBackListenerInstalled,
  pushOverlayBackEntry,
  setPageBackOwner,
  setPushNavigationBackActive,
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
describe("P5 페이지 뒤로 주인 슬롯", () => {
  it("등록하면 리스너 1개 설치, 해제하면 제거", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const release = setPageBackOwner(() => {});
    expect(isOverlayBackListenerInstalled()).toBe(true);
    expect(state.installs).toBe(1);
    release();
    expect(hasPageBackOwner()).toBe(false);
    expect(isOverlayBackListenerInstalled()).toBe(false);
    expect(state.removes).toBe(1);
  });

  it("순서: 오버레이 > 페이지 주인 > 결함 E", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const owner = vi.fn();
    const closeSheet = vi.fn();
    setPushNavigationBackActive(true);
    const releaseOwner = setPageBackOwner(owner);
    const releaseSheet = pushOverlayBackEntry(closeSheet);
    expect(state.installs).toBe(1);

    state.onBack?.({ canGoBack: false });
    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(owner).not.toHaveBeenCalled();

    releaseSheet();
    state.onBack?.({ canGoBack: true });
    expect(owner).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();

    releaseOwner();
    state.onBack?.({ canGoBack: false });
    expect(historyBack).toHaveBeenCalledTimes(1); // 결함 E 경로 그대로
    historyBack.mockRestore();
  });

  it("삼킴(blocking) 오버레이가 있으면 페이지 주인이 실행되지 않음", () => {
    const { driver, state } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const owner = vi.fn();
    setPageBackOwner(owner);
    pushOverlayBackEntry(null);
    state.onBack?.({ canGoBack: true });
    expect(owner).not.toHaveBeenCalled();
  });

  it("다른 화면이 새로 등록했으면 이전 해제가 새 주인을 지우지 않음", () => {
    const { driver } = fakeDriver();
    __setOverlayBackListenerDriverForTests(driver);
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = setPageBackOwner(first);
    const releaseSecond = setPageBackOwner(second);
    releaseFirst();
    expect(hasPageBackOwner()).toBe(true);
    expect(isOverlayBackListenerInstalled()).toBe(true);
    releaseSecond();
    expect(hasPageBackOwner()).toBe(false);
  });
});
