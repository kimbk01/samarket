// @vitest-environment jsdom
/**
 * 구조 수정안 1단계 C2-1 — 로그인 쿠키가 있고 세션 확인 중이면 비로그인(`_anon`) 미리 받기를 하지 않는다.
 * 비회원(쿠키 없음)·세션 확인 완료는 예전처럼 미리 받는다.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warmFeed = vi.fn();
vi.mock("@/lib/philife/warm-philife-neighborhood-feed", () => ({ warmPhilifeNeighborhoodFeedByUrl: (...a: unknown[]) => warmFeed(...a) }));
vi.mock("@/lib/philife/fetch-neighborhood-topic-options-client", () => ({ warmPhilifeNeighborhoodTopicOptions: vi.fn() }));
vi.mock("@/lib/ui/network-policy", () => ({
  isConstrainedNetwork: () => false,
  scheduleWhenBrowserIdle: (cb: () => void) => {
    cb();
    return 1;
  },
  cancelScheduledWhenBrowserIdle: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
let sig = "_anon";
vi.mock("@/hooks/use-philife-feed-viewer-sig", () => ({ usePhilifeFeedViewerSig: () => sig }));
let phase = "loading";
let phaseListener: (() => void) | null = null;
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  getSessionPhase: () => phase,
  subscribeSessionPhase: (l: () => void) => {
    phaseListener = l;
    return () => {
      phaseListener = null;
    };
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mountAndWait() {
  vi.resetModules();
  const { PhilifeFeedWarmPrefetch } = await import("@/components/community/PhilifeFeedWarmPrefetch");
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<PhilifeFeedWarmPrefetch />);
  });
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  return root;
}

beforeEach(() => {
  vi.useFakeTimers();
  warmFeed.mockClear();
  sig = "_anon";
  phase = "loading";
  document.cookie = "sb-proj-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});
afterEach(() => vi.useRealTimers());

describe("동네 피드 미리 받기 — 로그인 사용자의 비로그인용 미리 받기 생략", () => {
  it("로그인 쿠키 + 세션 확인 중 + `_anon` → 미리 받지 않음", async () => {
    document.cookie = "sb-proj-auth-token=abc";
    await mountAndWait();
    expect(warmFeed).not.toHaveBeenCalled();
  });
  it("세션 확인이 끝나면(authenticated) 바로 미리 받음 — 영영 빠지지 않음", async () => {
    document.cookie = "sb-proj-auth-token=abc";
    await mountAndWait();
    phase = "authenticated";
    await act(async () => phaseListener?.());
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(warmFeed).toHaveBeenCalledTimes(1);
  });
  it("쿠키 없는 비회원 → 예전처럼 미리 받음", async () => {
    await mountAndWait();
    expect(warmFeed).toHaveBeenCalledTimes(1);
  });
  it("사용자 서명이 정해졌으면 → 미리 받음", async () => {
    document.cookie = "sb-proj-auth-token=abc";
    sig = "user-1";
    await mountAndWait();
    expect(warmFeed).toHaveBeenCalledTimes(1);
  });
});
