/** @vitest-environment jsdom */
/**
 * F7-b (docs/audit/supabase-request-surge-2026-11-18/f7b-ringing-poll-reschedule-call-impact-2026-11-19.md)
 * 새 통화를 처음 찾은 조회에서 화면 주체 확보(맥: iOS 셸 비동기)가 조회보다 늦게 끝나면, 다음 예약이 울림 전 간격(25초)으로
 * 잡혀 「울리는 중 2초」가 지켜지지 않던 결함 — 확보 뒤 다음 조회를 다시 예약해 2초가 되는지 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => true) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => {
  const callV4FetchIncomingSessions = vi.fn();
  return {
    callV4FetchIncomingSessions,
    callV4FetchIncomingSessionsOutcome: vi.fn(async () => ({
      kind: "ok" as const,
      sessions: await callV4FetchIncomingSessions(),
    })),
    callV4FetchSession: vi.fn(),
  };
});
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", async () => {
  const { useCallV4Store } = await import("@/lib/community-messenger/call-v4/call-v4-store");
  return {
    callV4IncomingDiscovered: vi.fn(() => {
      useCallV4Store.getState().setPhase("incoming_ringing");
    }),
  };
});
/** 맥 iOS 셸처럼 화면 주체 확보가 몇 단계 늦게 끝난다 */
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", async () => {
  const { applyCallV4SurfaceOwnerSignal } = await import("@/lib/community-messenger/call-v4/call-v4-incoming-surface");
  return {
    tryPrimeCallV4WebIncomingOwner: vi.fn(async (callId: string) => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      applyCallV4SurfaceOwnerSignal({ callId, owner: "web_in_app", reason: "test", ts: Date.now() });
      return true;
    }),
  };
});
vi.mock("@/lib/platform/capacitor-native", () => ({ isCapacitorNativePlatform: vi.fn(() => false) }));
vi.mock("@/lib/community-messenger/monitoring/client", () => ({ messengerMonitorRecord: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal", () => ({
  confirmCallV4IncomingRemoteTerminal: vi.fn(async () => "not_current"),
  isCurrentCallV4IncomingRinging: vi.fn(() => false),
}));
type Listener = {
  onRinging: (e: { callId: string; startedAt: string | null }) => void;
  onStatus?: (s: string) => void;
};
const feed = { listener: null as Listener | null };
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed", () => ({
  acquireCallV4IncomingRealtimeFeed: vi.fn((_uid: string, l: Listener) => {
    feed.listener = l;
    return () => {};
  }),
}));

import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import {
  CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS,
  startCallV4IncomingDiscovery,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { clearAllCallV4NativeAcceptingSurfaces } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const fetchMock = vi.mocked(callV4FetchIncomingSessions);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
let stop: () => void = () => {};

function ringing(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    status: "ringing",
    isMineInitiator: false,
    startedAt: new Date().toISOString(),
  } as unknown as CommunityMessengerCallSession;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  feed.listener = null;
  clearAllCallV4NativeAcceptingSurfaces();
  useCallV4Store.getState().resetToIdle();
  fetchMock.mockResolvedValue([]);
  window.history.pushState({}, "", "/community-messenger");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  stop();
  stop = () => {};
  vi.useRealTimers();
});

describe("F7-b 새 통화 발견 직후 울리는 중 2초", () => {
  it.each(["realtime", "poll"] as const)("%s 로 처음 발견 → 화면 주체 확보가 늦어도 다음 조회는 2초 주기", async (via) => {
    stop = startCallV4IncomingDiscovery("me");
    await flush(0);
    feed.listener?.onStatus?.("SUBSCRIBED");
    await flush(CALL_V4_INCOMING_REALTIME_STABLE_AFTER_MS + 1_000);

    const callId = `call-${via}`;
    fetchMock.mockResolvedValue([ringing(callId)]);
    if (via === "realtime") {
      feed.listener?.onRinging({ callId, startedAt: new Date().toISOString() });
    } else {
      /** 보임 정상 간격(25초) 안에 다음 정기 조회가 온다 */
      await flush(25_000);
    }
    await flush(0);
    expect(useCallV4Store.getState().phase).toBe("incoming_ringing");

    const afterDiscover = fetchMock.mock.calls.length;
    await flush(10_000);
    /** 2초 주기면 10초에 5회(±1). 결함 상태(25초 예약)면 0회 */
    expect(fetchMock.mock.calls.length - afterDiscover).toBeGreaterThanOrEqual(4);
    /** 예약이 두 갈래로 갈라져 2초보다 잦아지지 않는다(타이머 1개 계약) */
    expect(fetchMock.mock.calls.length - afterDiscover).toBeLessThanOrEqual(6);
  });
});
