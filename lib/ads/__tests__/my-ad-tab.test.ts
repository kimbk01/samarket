import { afterEach, describe, expect, it } from "vitest";
import {
  classifyMyAdTab,
  classifyMyPostAdTab,
  consumeMyAdsReturnToPending,
  markMyAdsReturnToPending,
  MY_AD_TAB_VALUES,
} from "@/lib/ads/my-ad-tab";

describe("S46 classifyMyAdTab — 피드 배너 표시 상태 7종", () => {
  it.each([
    ["active", "active"],
    ["paused", "active"],
    ["pending_review", "pending"],
    ["scheduled", "pending"],
    ["rejected", "ended"],
    ["cancelled", "ended"],
    ["ended", "ended"],
  ] as const)("%s → %s", (status, tab) => {
    expect(classifyMyAdTab(status)).toBe(tab);
  });

  it("탭 = 진행중·대기·종료, 알 수 없는 값은 대기(종료로 숨기지 않음)", () => {
    expect(MY_AD_TAB_VALUES).toEqual(["active", "pending", "ended"]);
    expect(classifyMyAdTab("???")).toBe("pending");
    expect(classifyMyAdTab(null)).toBe("pending");
  });
});

describe("S46 포인트 홍보(post-ads) 상태 → 같은 3분류", () => {
  it.each([
    ["active", "active"],
    ["draft", "pending"],
    ["pending_payment", "pending"],
    ["pending_review", "pending"],
    ["approved", "pending"],
    ["rejected", "ended"],
    ["expired", "ended"],
    ["cancelled", "ended"],
  ] as const)("%s → %s", (status, tab) => {
    expect(classifyMyPostAdTab(status)).toBe(tab);
  });
});

describe("S46 신청 화면 다녀오면 [대기] 탭", () => {
  afterEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage?.clear();
  });

  it("표시 → 1회 소비", () => {
    const store = new Map<string, string>();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    expect(consumeMyAdsReturnToPending()).toBe(false);
    markMyAdsReturnToPending();
    expect(consumeMyAdsReturnToPending()).toBe(true);
    expect(consumeMyAdsReturnToPending()).toBe(false);
  });
});
