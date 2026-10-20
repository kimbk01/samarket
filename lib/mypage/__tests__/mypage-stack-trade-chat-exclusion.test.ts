import { describe, expect, it } from "vitest";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import { isMypageStackPath, mypageStackDepth } from "@/lib/mypage/mypage-stack-slide";

/** S28 — `/mypage/trade/chat/*`(채팅 준비 포함)는 내정보 300ms 슬라이드 규칙 미적용(거래 채팅 도메인 규칙 그대로) */
function run(prev: string, next: string, popstateBack = false) {
  const lastForwardAxisRef = { current: null as "ltr" | "rtl" | null };
  return computeRouteTransitionEnterKind(prev, next, { popstateBack, lastForwardAxisRef });
}

describe("S28 trade chat excluded from mypage stack", () => {
  it("스택 판정에서 제외", () => {
    expect(isMypageStackPath("/mypage/trade/chat/compose")).toBe(false);
    expect(isMypageStackPath("/mypage/trade/chat/room-1")).toBe(false);
    expect(isMypageStackPath("/mypage/trade/chat")).toBe(false);
    expect(mypageStackDepth("/mypage/trade/chat/compose")).toBe(-1);
    expect(isMypageStackPath("/mypage/trade/favorites")).toBe(true);
    expect(isMypageStackPath("/mypage/trade/chatter")).toBe(true);
  });

  it("내정보 ↔ 거래 채팅 쌍은 mypage-stack kind 가 아니다", () => {
    for (const [a, b, back] of [
      ["/mypage/trade", "/mypage/trade/chat/abc", false],
      ["/mypage", "/mypage/trade/chat/compose", false],
      ["/mypage/trade/chat/abc", "/mypage", true],
      ["/mypage/trade/chat/compose", "/mypage/trade/reviews", true],
    ] as const) {
      expect(run(a, b, back)).not.toMatch(/^mypage-stack-/);
    }
  });

  it("상품 상세 → 채팅하기 전환 불변", () => {
    expect(run("/post/x", "/mypage/trade/chat/compose")).toBe("rtl-forward");
    expect(run("/mypage/trade/chat/compose", "/post/x", true)).toBe("ltr-back");
  });

  it("다른 내정보 쌍은 그대로 300ms 스택", () => {
    expect(run("/mypage", "/mypage/trade/favorites")).toBe("mypage-stack-forward");
    expect(run("/mypage/trade/reviews", "/mypage", true)).toBe("mypage-stack-back");
  });
});
