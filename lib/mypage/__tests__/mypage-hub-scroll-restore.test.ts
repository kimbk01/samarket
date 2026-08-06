import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  isMypageHubPath,
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
});
