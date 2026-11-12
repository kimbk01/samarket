import { describe, expect, it } from "vitest";
import {
  getMobileTopTier1RuleSet,
  resolveCommunityTradeSwitchHub,
} from "@/lib/layout/mobile-top-tier1-rules";

/** 「정보교환 · 거래」 전환 줄(머리글 3단)은 허브 머리글 1단이 커뮤니티·거래 제목을 그리는 곳에서만 (Owner 「A 안」 2026-11-12) */
function hub(path: string) {
  return resolveCommunityTradeSwitchHub(path, getMobileTopTier1RuleSet(path));
}

describe("resolveCommunityTradeSwitchHub", () => {
  it("커뮤니티 허브", () => {
    expect(hub("/philife")).toBe("community");
    expect(hub("/philife/")).toBe("community");
    expect(hub("/community")).toBe("community");
  });

  it("거래 허브", () => {
    expect(hub("/market")).toBe("trade");
    expect(hub("/market?sort=near")).toBe("trade");
  });

  it("모임 홈 — 3단 「정보교환 · 거래 · 모임」 (Owner 「3판대로 구현」 2026-11-12)", () => {
    expect(hub("/moim")).toBe("moim");
    expect(hub("/moim/search")).toBeNull();
    expect(hub("/moim/new")).toBeNull();
  });

  it("허브 머리글이 아닌 화면엔 없음", () => {
    expect(hub("/market/sell")).toBeNull();
    expect(hub("/market/location")).toBeNull();
    expect(hub("/mypage/purchases")).toBeNull();
    expect(hub("/mypage")).toBeNull();
    expect(hub("/community-messenger")).toBeNull();
    expect(hub("/stores")).toBeNull();
    expect(hub("/home")).toBeNull();
  });
});
