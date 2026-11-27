/**
 * 고객 문의 최종 감사 L10·L14 — FAB 숫자 읽기: 요청 공유 · 5초 캐시 · 명시 신호는 캐시 건너뜀 · 401 표지 (동작).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSupportRequesterUnreadCache,
  fetchSupportRequesterUnread,
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
});
