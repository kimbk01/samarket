/** @vitest-environment jsdom */
/**
 * U2 (Owner 「U2 승인」 2026-11-08) — V4 웹 수신 Realtime 병행.
 * 원칙: 기존 2초 HTTP 폴링은 그대로. Realtime 신호는 같은 tick 을 통화당 1회 더 부를 뿐이다.
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

const metrics: Array<{ metric: string; value: unknown }> = [];
vi.mock("@/lib/community-messenger/monitoring/client", () => ({
  messengerMonitorRecord: vi.fn((e: { metric: string; value: unknown }) => metrics.push({ metric: e.metric, value: e.value })),
}));

type Listener = { onRinging: (e: { callId: string; startedAt: string | null }) => void; onStatus?: (s: string) => void };
const feed = { listener: null as Listener | null, acquired: 0, released: 0 };
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed", () => ({
  acquireCallV4IncomingRealtimeFeed: vi.fn((_uid: string, l: Listener) => {
    feed.listener = l;
    feed.acquired += 1;
    return () => {
      feed.released += 1;
    };
  }),
}));

import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  CALL_V4_INCOMING_REALTIME_NEVER_AFTER_MS,
  startCallV4IncomingDiscovery,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { clearAllCallV4NativeAcceptingSurfaces } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const ringing = (id: string): CommunityMessengerCallSession =>
  ({
    id,
    roomId: "room-1",
    status: "ringing",
    isMineInitiator: false,
    startedAt: new Date(Date.now() - 1000).toISOString(),
  }) as CommunityMessengerCallSession;

const fetchMock = vi.mocked(callV4FetchIncomingSessions);

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

let stop: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  metrics.length = 0;
  feed.listener = null;
  feed.acquired = 0;
  feed.released = 0;
  clearAllCallV4NativeAcceptingSurfaces();
  useCallV4Store.getState().resetToIdle();
  vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
  fetchMock.mockResolvedValue([]);
  window.history.pushState({}, "", "/community-messenger");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  stop();
  stop = () => {};
  vi.useRealTimers();
});

describe("V4 웹 수신 — 기존 폴링 유지", () => {
  it("Realtime 신호가 없을 때 2초 폴링 횟수는 이전과 같다(시작 1회 + 2초마다)", async () => {
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flush(2_000 * 5);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("S4: SUBSCRIBED 직후에도 폴링은 멈추지 않는다(즉시 1회 + 5초 동안 2초 주기)", async () => {
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await flush(2_000 * 2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("V4 웹 수신 — Realtime 신호", () => {
  it("신호가 오면 조회를 1회 더 하고, 같은 통화의 신호가 반복돼도 추가 조회는 통화당 1회", async () => {
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    feed.listener?.onRinging({ callId: "call-1", startedAt: null });
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    feed.listener?.onRinging({ callId: "call-1", startedAt: null });
    feed.listener?.onRinging({ callId: "call-1", startedAt: null });
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("조회 중에 신호가 오면 끝난 뒤 1회 다시 조회한다(신호 유실 방지)", async () => {
    let resolveFirst: (v: CommunityMessengerCallSession[]) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    feed.listener?.onRinging({ callId: "call-1", startedAt: null });
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst([]);
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("F2: 채팅 화면 밖(/philife)에서도 울림 신호 1회 → 조회 1회(측정은 그대로), /admin 은 0", async () => {
    window.history.pushState({}, "", "/philife");
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    const before = fetchMock.mock.calls.length;
    expect(before).toBe(0);
    feed.listener?.onRinging({ callId: "call-9", startedAt: null });
    await flush(0);
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(metrics.map((m) => m.metric)).toContain("incoming_realtime_outside_surface_visible");
    stop();
    window.history.pushState({}, "", "/admin/x");
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    feed.listener?.onRinging({ callId: "call-10", startedAt: null });
    await flush(0);
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("iOS·Android 앱 셸(Capacitor)에서는 Realtime 피드를 붙이지 않는다", async () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    expect(feed.acquired).toBe(0);
  });

  it("정리 시 피드를 해제한다", async () => {
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    stop();
    stop = () => {};
    expect(feed.released).toBe(1);
  });
});

describe("V4 웹 수신 — 측정", () => {
  it("신호보다 폴링이 먼저 발견하고 10초 안에 신호가 없으면 realtime_never 를 센다", async () => {
    fetchMock.mockResolvedValue([ringing("call-2")]);
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    expect(metrics.map((m) => m.metric)).toContain("incoming_found_poll_first_visible");
    await flush(CALL_V4_INCOMING_REALTIME_NEVER_AFTER_MS);
    expect(metrics.map((m) => m.metric)).toContain("incoming_realtime_never_visible");
  });

  it("폴링 발견 뒤 신호가 오면 realtime_never 를 세지 않는다", async () => {
    fetchMock.mockResolvedValue([ringing("call-3")]);
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    feed.listener?.onRinging({ callId: "call-3", startedAt: null });
    await flush(CALL_V4_INCOMING_REALTIME_NEVER_AFTER_MS);
    const names = metrics.map((m) => m.metric);
    expect(names).toContain("incoming_realtime_after_poll_visible");
    expect(names).not.toContain("incoming_realtime_never_visible");
  });

  it("신호가 먼저 오면 realtime_first 로 센다", async () => {
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    fetchMock.mockResolvedValue([ringing("call-4")]);
    feed.listener?.onRinging({ callId: "call-4", startedAt: null });
    await flush(0);
    const names = metrics.map((m) => m.metric);
    expect(names).toContain("incoming_realtime_signal_visible");
    expect(names).toContain("incoming_found_realtime_first_visible");
    expect(names).not.toContain("incoming_found_poll_first_visible");
  });

  it("구독 상태를 센다", async () => {
    stop = startCallV4IncomingDiscovery("user-b");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    feed.listener?.onStatus?.("CHANNEL_ERROR");
    const names = metrics.map((m) => m.metric);
    expect(names).toContain("incoming_feed_subscribed_visible");
    expect(names).toContain("incoming_feed_channel_error_visible");
  });
});
