import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchSessionForCallerPoll: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return {
    ...actual,
    callV4FetchSessionForCallerPoll: apiMocks.fetchSessionForCallerPoll,
  };
});

import { parseCallV4RetryAfterMs } from "@/lib/community-messenger/call-v4/call-v4-api";
import {
  CALL_V4_SESSION_STATUS_POLL_MS,
  readCallV4SessionStatusPollerCountForTests,
  resetCallV4SessionStatusPollerForTests,
  subscribeCallV4SessionStatus,
} from "@/lib/community-messenger/call-v4/call-v4-session-status-poller";

const ringing = { session: { id: "c1", status: "ringing" }, httpStatus: 200, notFound: false };

describe("C-12 — callId 당 공유 세션 poller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    resetCallV4SessionStatusPollerForTests();
    apiMocks.fetchSessionForCallerPoll.mockReset();
    apiMocks.fetchSessionForCallerPoll.mockResolvedValue(ringing);
  });
  afterEach(() => {
    resetCallV4SessionStatusPollerForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("구독자 3개가 같은 callId 면 요청은 tick 당 1회, 주기 1초", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    subscribeCallV4SessionStatus("c1", a);
    subscribeCallV4SessionStatus("c1", b);
    subscribeCallV4SessionStatus("c1", c, { immediate: false });
    expect(readCallV4SessionStatusPollerCountForTests()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CALL_V4_SESSION_STATUS_POLL_MS * 3);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(4);
    expect(a).toHaveBeenCalledTimes(4);
    expect(b).toHaveBeenCalledTimes(4);
    expect(c).toHaveBeenCalledTimes(4);
  });

  it("마지막 구독 해제 시 타이머 정지", async () => {
    const off1 = subscribeCallV4SessionStatus("c1", vi.fn());
    const off2 = subscribeCallV4SessionStatus("c1", vi.fn());
    off1();
    expect(readCallV4SessionStatusPollerCountForTests()).toBe(1);
    off2();
    expect(readCallV4SessionStatusPollerCountForTests()).toBe(0);
    apiMocks.fetchSessionForCallerPoll.mockClear();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(apiMocks.fetchSessionForCallerPoll).not.toHaveBeenCalled();
  });

  it("429 Retry-After 동안 조회하지 않고 구독자에게 전달하지 않는다", async () => {
    apiMocks.fetchSessionForCallerPoll.mockResolvedValueOnce({
      session: null,
      httpStatus: 429,
      notFound: false,
      retryAfterMs: 4_000,
    });
    const listener = vi.fn();
    subscribeCallV4SessionStatus("c1", listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("요청 중이면 다음 tick 은 건너뛴다(중첩 요청 0)", async () => {
    let resolve: ((v: unknown) => void) | null = null;
    apiMocks.fetchSessionForCallerPoll.mockImplementationOnce(
      () => new Promise((r) => {
        resolve = r;
      }),
    );
    subscribeCallV4SessionStatus("c1", vi.fn());
    await vi.advanceTimersByTimeAsync(2_500);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(1);
    resolve?.(ringing);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(2);
  });

  it("원하는 구독자가 없으면(isWanted=false) 요청하지 않는다", async () => {
    let wanted = false;
    subscribeCallV4SessionStatus("c1", vi.fn(), { isWanted: () => wanted });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(apiMocks.fetchSessionForCallerPoll).not.toHaveBeenCalled();
    wanted = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(1);
  });

  it("Retry-After 해석(초·HTTP-date·잘못된 값)", () => {
    expect(parseCallV4RetryAfterMs("3")).toBe(3_000);
    expect(parseCallV4RetryAfterMs("1.5")).toBe(1_500);
    const now = Date.parse("2026-10-21T00:00:00Z");
    expect(parseCallV4RetryAfterMs("Wed, 21 Oct 2026 00:00:05 GMT", now)).toBe(5_000);
    expect(parseCallV4RetryAfterMs("abc")).toBeNull();
    expect(parseCallV4RetryAfterMs(null)).toBeNull();
  });
});
