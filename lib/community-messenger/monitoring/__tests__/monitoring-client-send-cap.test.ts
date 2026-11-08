// @vitest-environment jsdom
/**
 * U1 (Owner 「U1 승인」 2026-11-08) — 메신저 모니터링 전송 상한.
 * 2026-11-08 폭주: 24개마다 즉시 전송·상한 없음 → 분당 약 225회 POST.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev/is-dev-safe-mode", () => ({ isDevSafeMode: () => false }));
vi.mock("@/lib/community-messenger/dev/cm-event-loop-dev", () => ({ cmProdParityModeEnabled: () => false }));
vi.mock("@/lib/community-messenger/room/cm-room-entry-priority-mode", () => ({
  shouldDeferMessengerMonitoringFlush: () => false,
}));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => false,
  resolveCapacitorShellPlatform: () => null,
}));
vi.mock("../logger", () => ({ logMessengerAlertDev: () => {}, logMessengerMonitoringDev: () => {} }));

import {
  __resetMessengerMonitorClientForTests,
  flushMessengerMonitorQueue,
  MESSENGER_MONITOR_FLUSH_INTERVAL_MS,
  MESSENGER_MONITOR_MAX_EVENTS_PER_FLUSH,
  messengerMonitorRecord,
} from "../client";

const fetchMock = vi.fn(async () => new Response("{}"));

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

function record(n: number, metric = "bootstrap_fetch") {
  for (let i = 0; i < n; i++) {
    messengerMonitorRecord({ category: "chat.room_load", metric, value: 10 + i, unit: "ms" });
  }
}

function sentBodies(): Array<{ events: unknown[]; dropped: Array<{ category: string; metric: string; count: number }>; platform: string }> {
  return fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).body)));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  setVisibility("visible");
  __resetMessengerMonitorClientForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("메신저 모니터링 전송 상한 (U1)", () => {
  it("이벤트가 아무리 많아도 5분 동안 POST 는 1회, 이벤트는 최대 64개이고 나머지는 버린 수로 보낸다", async () => {
    record(1000);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = sentBodies();
    expect(body.events).toHaveLength(MESSENGER_MONITOR_MAX_EVENTS_PER_FLUSH);
    expect(body.dropped).toEqual([{ category: "chat.room_load", metric: "bootstrap_fetch", count: 1000 - 64 }]);
    expect(body.platform).toBe("web");
  });

  it("1시간 동안 계속 기록해도 POST 는 12회를 넘지 않는다", async () => {
    for (let minute = 0; minute < 60; minute++) {
      record(300);
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(12);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(11);
  });

  it("수동 flush(방 나갈 때)는 5분 간격 안이면 보내지 않는다", async () => {
    record(5);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    record(5);
    await flushMessengerMonitorQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("숨김 탭에서는 보내지 않고, 보이게 되면 보낸다", async () => {
    setVisibility("hidden");
    record(5);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("페이지를 떠날 때(pagehide)는 간격과 상관없이 1회만 keepalive 로 보낸다", async () => {
    record(5);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    record(3);
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).keepalive).toBe(true);
    record(3);
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("전송 실패는 다시 보내지 않는다(재시도 폭주 금지)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    record(5);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("버린 종류가 64개를 넘으면 넘친 종류는 1개 키로 센다", async () => {
    record(MESSENGER_MONITOR_MAX_EVENTS_PER_FLUSH);
    for (let i = 0; i < 70; i++) record(1, `m${i}`);
    await vi.advanceTimersByTimeAsync(MESSENGER_MONITOR_FLUSH_INTERVAL_MS);
    const [body] = sentBodies();
    expect(body.dropped).toHaveLength(65);
    expect(body.dropped.find((d) => d.metric === "dropped_key_overflow")).toEqual({
      category: "monitoring",
      metric: "dropped_key_overflow",
      count: 6,
    });
  });
});
