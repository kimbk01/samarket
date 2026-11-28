// @vitest-environment jsdom
/**
 * Owner 결정 3(2026-11-28 「권장안대로 구현」) — 주소로 바로 들어온 화면의 고정 목적지 뒤로(바꿔치기)도 「뒤로」 움직임
 * 실측(수정 전 Xiaomi 녹화): 관심이웃 관리 [완료] → 관심이웃 화면이 오른쪽에서 들어옴(앞으로 움직임)
 */
import { describe, expect, it, vi } from "vitest";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";
import { consumeRouteTransitionBackIntent } from "@/lib/navigation/route-transition-back-intent";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";

const MANAGE = "/mypage/section/community/community-friends-manage";
const LIST = "/mypage/section/community/community-friends";

describe("고정 목적지 뒤로 — 바꿔치기면 다음 전환을 「뒤로」로", () => {
  it("기록이 없어 바꿔치기 → 목적지 경로 전환 1번은 뒤로, 그다음은 아님", () => {
    const router = { back: vi.fn(), replace: vi.fn() };
    expect(runFixedDestinationBack(router, LIST)).toBe("replace");
    expect(consumeRouteTransitionBackIntent(LIST)).toBe(true);
    expect(consumeRouteTransitionBackIntent(LIST)).toBe(false);
  });

  it("다른 경로로 바뀌면 표시를 버림 (늦게 남은 표시가 다른 이동을 뒤로 만들지 않음)", () => {
    runFixedDestinationBack({ back: vi.fn(), replace: vi.fn() }, LIST);
    expect(consumeRouteTransitionBackIntent("/mypage")).toBe(false);
    expect(consumeRouteTransitionBackIntent(LIST)).toBe(false);
  });

  it("같은 깊이 내정보 화면: 표시가 없으면 앞으로(수정 전 실측과 같음), 뒤로 표시면 뒤로", () => {
    const ref = { current: null as "ltr" | "rtl" | null };
    const resolveIndex = () => -1;
    expect(computeRouteTransitionEnterKind(MANAGE, LIST, { popstateBack: false, lastForwardAxisRef: ref, resolveIndex } as never)).toBe(
      "mypage-stack-forward",
    );
    expect(computeRouteTransitionEnterKind(MANAGE, LIST, { popstateBack: true, lastForwardAxisRef: ref, resolveIndex } as never)).toBe(
      "mypage-stack-back",
    );
  });
});

describe("기록 뒤로 대체 이동(기록을 못 읽는 WebView) — 목적지로 가도 「뒤로」 (2차 재감사)", () => {
  it("기록이 없어 목적지로 push → 다음 전환은 뒤로", async () => {
    const { runHistoryBackWithFallback } = await import("@/lib/navigation/history-back-fallback");
    const router = { back: vi.fn(), push: vi.fn() };
    Object.defineProperty(window.history, "length", { configurable: true, value: 1 });
    runHistoryBackWithFallback(router, LIST);
    expect(router.push).toHaveBeenCalledWith(LIST);
    expect(consumeRouteTransitionBackIntent(LIST)).toBe(true);
  });
});
