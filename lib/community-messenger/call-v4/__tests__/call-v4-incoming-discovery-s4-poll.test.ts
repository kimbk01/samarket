/** @vitest-environment jsdom */
/**
 * S4 — V4 웹 수신 조회 축소 (docs/audit/supabase-request-surge-s4-poll-reduction-design-2026-11-08.md §2)
 * SUBSCRIBED 5초 이상 유지 동안만 2초 → 10초. 울리는 중·끊김·오류·연결 중은 2초. 상태 전환·보임 전환·online 은 즉시 1회.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => true) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => {
  const callV4FetchIncomingSessions = vi.fn();
  return {
    callV4FetchIncomingSessions,
    /** F1: 수신 조회 루프는 Outcome 을 쓴다 — 이 파일의 목록 mock 을 「200 ok」로 감싼다(예외는 그대로 throw). */
    callV4FetchIncomingSessionsOutcome: vi.fn(async () => ({
      kind: "ok" as const,
      sessions: await callV4FetchIncomingSessions(),
    })),
    callV4FetchSession: vi.fn(),
  };
});
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({ callV4IncomingDiscovered: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", () => ({
  tryPrimeCallV4WebIncomingOwner: vi.fn(async () => {}),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({ isCapacitorNativePlatform: vi.fn(() => false) }));
const metrics: string[] = [];
vi.mock("@/lib/community-messenger/monitoring/client", () => ({
  messengerMonitorRecord: vi.fn((e: { metric: string }) => metrics.push(e.metric)),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal", () => ({
  confirmCallV4IncomingRemoteTerminal: vi.fn(async () => "not_current"),
  isCurrentCallV4IncomingRinging: vi.fn(() => false),
}));
type Listener = {
  onRinging: (e: { callId: string; startedAt: string | null }) => void;
  onStatus?: (s: string) => void;
};
const feed = { listener: null as Listener | null, acquired: 0 };
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed", () => ({
  acquireCallV4IncomingRealtimeFeed: vi.fn((_uid: string, l: Listener) => {
    feed.listener = l;
    feed.acquired += 1;
    return () => {};
  }),
}));

import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS,
  CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS,
  resolveCallV4IncomingDiscoveryPollDelayMs,
  startCallV4IncomingDiscovery,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { clearAllCallV4NativeAcceptingSurfaces } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const fetchMock = vi.mocked(callV4FetchIncomingSessions);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
let stop: () => void = () => {};

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: v });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  metrics.length = 0;
  feed.listener = null;
  feed.acquired = 0;
  clearAllCallV4NativeAcceptingSurfaces();
  useCallV4Store.getState().resetToIdle();
  vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
  fetchMock.mockResolvedValue([]);
  window.history.pushState({}, "", "/community-messenger");
  setVisibility("visible");
});

afterEach(() => {
  stop();
  stop = () => {};
  vi.useRealTimers();
});

describe("간격 표 (resolveCallV4IncomingDiscoveryPollDelayMs)", () => {
  it("채팅 화면 밖 60초 · 실패 백오프 · 울림 2초 · 실시간 정상 10초 · 그 밖 2초", () => {
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(false, 0, { ringing: false, healthy: true })).toBe(60_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 2, { ringing: false, healthy: true })).toBe(8_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, { ringing: true, healthy: true })).toBe(2_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, { ringing: false, healthy: true })).toBe(
      CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS,
    );
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, { ringing: false, healthy: false })).toBe(2_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0)).toBe(2_000);
  });

  it("10초는 30초 울림 안에 최소 2번 조회 기회가 있는 값", () => {
    expect(CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS * 2).toBeLessThan(30_000);
  });
});

describe("주기 동작", () => {
  it("실시간 상태가 없으면(피드 미연결) 기존과 같이 2초", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    await flush(2_000 * 5);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("SUBSCRIBED 5초 유지 뒤부터 10초 주기", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(0);
    const afterResync = fetchMock.mock.calls.length;
    await flush(CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS + 1_000);
    const afterStable = fetchMock.mock.calls.length;
    expect(afterStable - afterResync).toBe(3);
    await flush(CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS * 3);
    expect(fetchMock.mock.calls.length - afterStable).toBe(3);
  });

  it("10초 주기 중 연결이 끊기면 즉시 1회 조회하고 2초로 돌아간다", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS + 2_000);
    const before = fetchMock.mock.calls.length;
    feed.listener?.onStatus?.("CHANNEL_ERROR");
    await flush(0);
    expect(fetchMock.mock.calls.length - before).toBe(1);
    await flush(2_000 * 3);
    expect(fetchMock.mock.calls.length - before).toBe(4);
  });

  it("울리는 중이면 실시간이 정상이어도 2초", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS + 2_000);
    useCallV4Store.getState().setIdentity({
      callId: "call-1",
      roomId: "r",
      callerUserId: "c",
      calleeUserId: "me",
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
    });
    useCallV4Store.setState({ phase: "incoming_ringing" });
    feed.listener?.onRinging({ callId: "call-1", startedAt: null });
    await flush(0);
    const before = fetchMock.mock.calls.length;
    await flush(2_000 * 3);
    expect(fetchMock.mock.calls.length - before).toBe(3);
  });

  it("탭이 보이게 되면 즉시 1회 조회", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS + 2_000);
    const before = fetchMock.mock.calls.length;
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(0);
    expect(fetchMock.mock.calls.length - before).toBe(1);
  });

  it("online 이벤트에 즉시 1회 조회", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    const before = fetchMock.mock.calls.length;
    window.dispatchEvent(new Event("online"));
    await flush(0);
    expect(fetchMock.mock.calls.length - before).toBe(1);
  });

  it("즉시 조회와 정기 조회가 겹쳐도 예약은 1개(조회가 두 배가 되지 않음)", async () => {
    let resolveFirst: (v: CommunityMessengerCallSession[]) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    window.dispatchEvent(new Event("online"));
    await flush(0);
    resolveFirst([]);
    await flush(0);
    const before = fetchMock.mock.calls.length;
    await flush(2_000 * 2);
    expect(fetchMock.mock.calls.length - before).toBeLessThanOrEqual(2);
  });
});

describe("측정·적용 범위", () => {
  it("정기 조회마다 상태별 poll_tick 을 센다", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    expect(metrics).toContain("poll_tick_unsubscribed_visible");
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS + CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS + 1_000);
    expect(metrics).toContain("poll_tick_subscribed_visible");
  });

  it("앱 셸(Capacitor)은 피드·S4 없이 기존 2초", async () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    await flush(2_000 * 3);
    expect(feed.acquired).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(metrics.some((m) => m.startsWith("poll_tick"))).toBe(false);
  });
});
