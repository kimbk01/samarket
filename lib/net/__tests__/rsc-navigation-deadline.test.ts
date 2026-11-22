/**
 * 화면 이동 요청 상한 관문 — 설계 docs/audit/idle-menu-freeze-design-2026-11-22.md §S2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRscNavigationDeadlineForTest,
  expireStalledRscNavigations,
  resolveRscNavigationDeadlineTarget,
  wrapFetchWithRscNavigationDeadline,
} from "@/lib/net/rsc-navigation-deadline.client";
import { NAVIGATION_STALL_DEADLINE_MS } from "@/lib/net/navigation-stall-policy";

const HERE = "https://samarket.vercel.app/market";
const nav = { headers: { rsc: "1", "next-router-state-tree": "x" } };

describe("대상 판정 — 모두 해당할 때만", () => {
  it("다른 경로로 가는 화면 이동 요청 = 대상", () => {
    expect(resolveRscNavigationDeadlineTarget("https://samarket.vercel.app/philife?_rsc=abc", nav, HERE)).toBe("/philife");
    expect(resolveRscNavigationDeadlineTarget(new URL("/mypage/", HERE), nav, HERE)).toBe("/mypage");
  });
  it("rsc 헤더 없음(일반 요청·/api) = 아님", () => {
    expect(resolveRscNavigationDeadlineTarget("/api/me/profile", {}, HERE)).toBeNull();
    expect(resolveRscNavigationDeadlineTarget("/philife", undefined, HERE)).toBeNull();
  });
  it("미리받기 = 아님", () => {
    expect(
      resolveRscNavigationDeadlineTarget("/philife", { headers: { rsc: "1", "next-router-prefetch": "1" } }, HERE)
    ).toBeNull();
  });
  it("서버 액션 = 아님", () => {
    expect(resolveRscNavigationDeadlineTarget("/philife", { headers: { rsc: "1", "next-action": "abc" } }, HERE)).toBeNull();
  });
  it("호출 쪽 signal 있음 = 아님", () => {
    expect(
      resolveRscNavigationDeadlineTarget("/philife", { ...nav, signal: new AbortController().signal }, HERE)
    ).toBeNull();
  });
  it("같은 경로(router.refresh·쿼리만 변경) = 아님 — 작성 중 화면 보호", () => {
    expect(resolveRscNavigationDeadlineTarget("/market?_rsc=1", nav, HERE)).toBeNull();
    expect(resolveRscNavigationDeadlineTarget("/market/?tab=x", nav, HERE)).toBeNull();
  });
  it("통화 경로(목표·지금) = 아님 — 통화 동작 무변경", () => {
    expect(resolveRscNavigationDeadlineTarget("/community-messenger/calls/1", nav, HERE)).toBeNull();
    expect(resolveRscNavigationDeadlineTarget("/market", nav, "https://samarket.vercel.app/call/x")).toBeNull();
  });
  it("다른 출처·Request 객체 = 아님", () => {
    expect(resolveRscNavigationDeadlineTarget("https://example.com/philife", nav, HERE)).toBeNull();
    expect(resolveRscNavigationDeadlineTarget(new Request("https://samarket.vercel.app/philife"), nav, HERE)).toBeNull();
  });
});

describe("상한 동작", () => {
  let stalls: { waitedMs: number; targetPath: string }[] = [];
  let liveCall = false;
  const deps = () => ({
    deadlineMs: NAVIGATION_STALL_DEADLINE_MS,
    currentHref: () => HERE,
    hasLiveCall: () => liveCall,
    onStall: (i: { waitedMs: number; targetPath: string }) => void stalls.push(i),
  });
  /** 끝나지 않는 요청 — 중단 신호가 오면 AbortError 로 끝난다 */
  const hangingFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  }) as unknown as typeof fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    stalls = [];
    liveCall = false;
    __resetRscNavigationDeadlineForTest();
  });
  afterEach(() => {
    __resetRscNavigationDeadlineForTest();
    vi.useRealTimers();
  });

  it("8초 안에 응답 없으면 중단(Next 는 실패 → 문서 이동으로 대체) · 계측 1건", async () => {
    const f = wrapFetchWithRscNavigationDeadline(hangingFetch, deps());
    const p = f("/philife?_rsc=1", nav);
    const settled = p.catch((e: unknown) => e);
    vi.advanceTimersByTime(NAVIGATION_STALL_DEADLINE_MS - 1);
    expect(stalls).toEqual([]);
    vi.advanceTimersByTime(1);
    const err = (await settled) as DOMException;
    expect(err.name).toBe("AbortError");
    expect(stalls).toEqual([{ waitedMs: NAVIGATION_STALL_DEADLINE_MS, targetPath: "/philife" }]);
  });

  it("제때 응답하면 그대로 — 타이머 해제·계측 0", async () => {
    const res = new Response("ok");
    const f = wrapFetchWithRscNavigationDeadline(vi.fn(async () => res) as unknown as typeof fetch, deps());
    await expect(f("/philife", nav)).resolves.toBe(res);
    vi.advanceTimersByTime(NAVIGATION_STALL_DEADLINE_MS * 2);
    expect(stalls).toEqual([]);
    expect(expireStalledRscNavigations()).toBe(false);
  });

  it("대상 아님(미리받기)·내 통화 중이면 원래 요청 그대로(signal 추가 안 함)", () => {
    const base = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const f = wrapFetchWithRscNavigationDeadline(base, deps());
    const pre = { headers: { rsc: "1", "next-router-prefetch": "1" } };
    void f("/philife", pre);
    liveCall = true;
    void f("/philife", nav);
    const calls = (base as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[0][1]).toBe(pre);
    expect(calls[1][1]).toBe(nav);
  });

  it("하단 탭 감시가 먼저 끝내면 진행 중 요청을 중단 — 관문 계측은 다시 하지 않는다(문서 이동 1회)", async () => {
    const f = wrapFetchWithRscNavigationDeadline(hangingFetch, deps());
    const settled = f("/stores", nav).catch((e: unknown) => e);
    vi.advanceTimersByTime(3_000);
    expect(expireStalledRscNavigations()).toBe(true);
    expect(((await settled) as DOMException).name).toBe("AbortError");
    vi.advanceTimersByTime(NAVIGATION_STALL_DEADLINE_MS);
    expect(stalls).toEqual([]);
    expect(expireStalledRscNavigations()).toBe(false);
  });
});
