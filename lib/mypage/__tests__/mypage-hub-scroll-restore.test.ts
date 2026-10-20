import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  MYPAGE_SCROLL_RESTORE_TTL_MS,
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

  it("§1.4: 홈 스크롤 저장 유효시간은 30분 (60초 아님)", () => {
    expect(MYPAGE_SCROLL_RESTORE_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("§1.4: 60초 넘게(10분) 하위 화면에 머물러도 저장 위치가 남고, 30분 넘으면 만료", () => {
    const now = 1_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal("performance", { getEntriesByType: () => [{ type: "back_forward" }] });
    sessionStorage.setItem(
      "dibay:mypage-hub-scroll",
      JSON.stringify({ y: 420, saved_at: now - 10 * 60_000 })
    );
    // pending 없이 back_forward 경로 → 저장 y 가 유효할 때만 true
    expect(consumeMypageHubScrollPopstatePending()).toBe(true);
    sessionStorage.setItem(
      "dibay:mypage-hub-scroll",
      JSON.stringify({ y: 420, saved_at: now - 31 * 60_000 })
    );
    expect(consumeMypageHubScrollPopstatePending()).toBe(false);
    vi.restoreAllMocks();
  });
});
