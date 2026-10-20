import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  clearMypageHubScrollPopstatePending,
  consumeMypageHubScrollPopstatePending,
  isMypageHubPath,
  noteMypageHubScrollPopstatePending,
  prepareMypageHubScrollForLeave,
  resetMypageHubScrollRestoreForTests,
  tryRestoreMypageHubScroll,
} from "@/lib/mypage/mypage-hub-scroll-restore";

describe("mypage-hub-scroll-restore", () => {
  beforeEach(() => {
    resetMypageHubScrollRestoreForTests();
    const store: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", {
      getItem(k: string) {
        return store[k] ?? null;
      },
      setItem(k: string, v: string) {
        store[k] = v;
      },
      removeItem(k: string) {
        delete store[k];
      },
    });
  });
  afterEach(() => {
    resetMypageHubScrollRestoreForTests();
    vi.unstubAllGlobals();
  });

  it("recognizes exact hub only", () => {
    expect(isMypageHubPath("/mypage")).toBe(true);
    expect(isMypageHubPath("/mypage/")).toBe(true);
    expect(isMypageHubPath("/mypage/account")).toBe(false);
  });

  it("prepare leave marks pending so restore can consume", () => {
    prepareMypageHubScrollForLeave();
    const r = tryRestoreMypageHubScroll();
    expect(typeof r.restored).toBe("boolean");
  });

  it("D21: /my 별칭도 같은 홈으로 본다", () => {
    expect(isMypageHubPath("/my")).toBe(true);
    expect(isMypageHubPath("/my/settings")).toBe(false);
  });

  it("D21: 홈이 아닌 화면으로 뒤로가기 하면 복원 대기를 지운다", () => {
    noteMypageHubScrollPopstatePending();
    clearMypageHubScrollPopstatePending();
    expect(consumeMypageHubScrollPopstatePending()).toBe(false);
    noteMypageHubScrollPopstatePending();
    expect(consumeMypageHubScrollPopstatePending()).toBe(true);
  });
});
