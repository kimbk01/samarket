/**
 * 고객 문의 최종 감사 L10·L14 — FAB 숫자 읽기: 요청 공유 · 5초 캐시 · 명시 신호는 캐시 건너뜀 · 401 표지 (동작).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSupportRequesterUnreadCache,
  fetchSupportRequesterUnread,
  markSupportRequesterUnreadStale,
  SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED,
} from "@/lib/support/support-requester-unread-fetch";

const fetchMock = vi.fn();

beforeEach(() => {
  clearSupportRequesterUnreadCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, unread: 2 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("support requester unread fetch", () => {
  it("mounts at once share one request; within 5s the cached number is reused (고치기 전: 마운트마다 목록 GET)", async () => {
    const [a, b] = await Promise.all([
      fetchSupportRequesterUnread("u1|MEMBER|", "summary=unread&audience=MEMBER", false),
      fetchSupportRequesterUnread("u1|MEMBER|", "summary=unread&audience=MEMBER", false),
    ]);
    expect([a, b]).toEqual([2, 2]);
    expect(await fetchSupportRequesterUnread("u1|MEMBER|", "summary=unread&audience=MEMBER", false)).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/support/cases?summary=unread&audience=MEMBER");
  });

  it("an explicit signal (force) bypasses the cache; after 5s the cache expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T00:00:00.000Z"));
    await fetchSupportRequesterUnread("k", "q", false);
    await fetchSupportRequesterUnread("k", "q", true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-11-28T00:00:06.000Z"));
    await fetchSupportRequesterUnread("k", "q", false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("another user / store is a different key (no number carried across accounts)", async () => {
    await fetchSupportRequesterUnread("u1|MEMBER|", "q", false);
    await fetchSupportRequesterUnread("u2|MEMBER|", "q", false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("401 is reported so the badge resets to 0; other failures return null (keep last value)", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 401 }));
    expect(await fetchSupportRequesterUnread("a", "q", false)).toBe(SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED);
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    expect(await fetchSupportRequesterUnread("b", "q", false)).toBeNull();
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    expect(await fetchSupportRequesterUnread("c", "q", false)).toBeNull();
    // 실패 뒤에도 다음 호출은 다시 읽는다(진행 중 표지가 남지 않음)
    expect(await fetchSupportRequesterUnread("c", "q", false)).toBe(2);
  });

  it("L4: a forced read while a request is in flight runs one more request after it (not the stale in-flight number)", async () => {
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(JSON.stringify({ ok: true, unread: 1 }), { status: 200 }));
        })
    );
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: true, unread: 5 }), { status: 200 }));
    const first = fetchSupportRequesterUnread("f", "q", false);
    await Promise.resolve();
    // 새 답변 알림이 와서 강제 다시 읽기 — 진행 중 요청은 알림 전에 시작했다
    const forcedA = fetchSupportRequesterUnread("f", "q", true);
    const forcedB = fetchSupportRequesterUnread("f", "q", true);
    for (let i = 0; i < 5 && !release; i++) await Promise.resolve();
    (release as unknown as () => void)();
    expect(await first).toBe(1);
    // 고치기 전: 강제 호출도 진행 중 요청(1)을 그대로 받았다
    expect(await forcedA).toBe(5);
    expect(await forcedB).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("병합 전 2차 2: 창이 열렸다(낡음 표시) → 닫힌 뒤 첫 읽기는 5초 캐시를 쓰지 않고 새로 읽는다", async () => {
    expect(await fetchSupportRequesterUnread("k2", "q", false)).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 창 안에서 답변을 읽어 서버 숫자가 0 이 됨
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, unread: 0 }), { status: 200 }));
    markSupportRequesterUnreadStale();
    // 다시 붙는 FAB 의 첫 읽기(강제 아님) — 5초 안이어도 새로 읽는다
    expect(await fetchSupportRequesterUnread("k2", "q", false)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 그 뒤로는 다시 캐시
    expect(await fetchSupportRequesterUnread("k2", "q", false)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("병합 전 2차 2 (구조 확인): FAB 호스트가 창이 열릴 때 낡음 표시를 한다", async () => {
    const { readFileSync } = await import("node:fs");
    const host = readFileSync("components/support/SupportFabHost.tsx", "utf8");
    expect(host).toContain("if (modalOpen) markSupportRequesterUnreadStale();");
  });
});
