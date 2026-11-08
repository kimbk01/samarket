/** @vitest-environment jsdom */
/**
 * 웹 V4 수신 중 원격 종료 — 전달 경로 T1(Realtime 행 변경)·T2(폴링 목록에서 빠짐)가 단일 확인 함수만 부르는지.
 * docs/audit/call-v4-web-incoming-remote-terminal-root-cause-design-2026-11-08.md §3-2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => true) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchIncomingSessions: vi.fn(),
  callV4FetchSession: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({ callV4IncomingDiscovered: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", () => ({
  tryPrimeCallV4WebIncomingOwner: vi.fn(async () => {}),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({ isCapacitorNativePlatform: vi.fn(() => false) }));
vi.mock("@/lib/community-messenger/monitoring/client", () => ({ messengerMonitorRecord: vi.fn() }));

const confirmMock = vi.fn(async () => "finalized");
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal", async () => {
  const store = await import("@/lib/community-messenger/call-v4/call-v4-store");
  return {
    confirmCallV4IncomingRemoteTerminal: (...a: unknown[]) => confirmMock(...(a as [])),
    isCurrentCallV4IncomingRinging: (callId: string) => {
      const identity = store.readCallV4Identity();
      return store.readCallV4Phase() === "incoming_ringing" && identity?.callId === callId && identity.direction === "incoming";
    },
  };
});

type Listener = {
  onRinging: (e: { callId: string; startedAt: string | null }) => void;
  onSessionStatus?: (e: { callId: string; status: string }) => void;
};
const feed = { listener: null as Listener | null };
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed", () => ({
  acquireCallV4IncomingRealtimeFeed: vi.fn((_uid: string, l: Listener) => {
    feed.listener = l;
    return () => {};
  }),
}));

import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import { startCallV4IncomingDiscovery } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { clearAllCallV4NativeAcceptingSurfaces } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const fetchMock = vi.mocked(callV4FetchIncomingSessions);

function seedRinging(callId = "call-1") {
  useCallV4Store.getState().resetToIdle();
  useCallV4Store.getState().setIdentity({
    callId,
    roomId: "room-1",
    callerUserId: "caller",
    calleeUserId: "me",
    direction: "incoming",
    mediaType: "audio",
    createdAt: new Date().toISOString(),
  });
  useCallV4Store.setState({ phase: "incoming_ringing" });
}

let stop: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  confirmMock.mockClear();
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

describe("T1 — Realtime 행 변경", () => {
  it("울리는 중인 통화의 상태 변경이 오면 확인 함수를 부른다", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await vi.advanceTimersByTimeAsync(0);
    seedRinging("call-1");
    feed.listener?.onSessionStatus?.({ callId: "call-1", status: "cancelled" });
    expect(confirmMock).toHaveBeenCalledWith("call-1", "realtime_incoming_status");
  });

  it("울리는 중이 아닌 통화(연결 중·다른 통화)의 변경은 무시한다", async () => {
    stop = startCallV4IncomingDiscovery("me");
    await vi.advanceTimersByTimeAsync(0);
    seedRinging("call-1");
    feed.listener?.onSessionStatus?.({ callId: "call-2", status: "missed" });
    useCallV4Store.setState({ phase: "connected" });
    feed.listener?.onSessionStatus?.({ callId: "call-1", status: "ended" });
    expect(confirmMock).not.toHaveBeenCalled();
  });
});

describe("T2 — 폴링 목록에서 빠짐", () => {
  it("울리는 중인 통화가 조회 결과에 없으면 확인 함수를 부른다", async () => {
    seedRinging("call-1");
    fetchMock.mockResolvedValue([]);
    stop = startCallV4IncomingDiscovery("me");
    await vi.advanceTimersByTimeAsync(0);
    expect(confirmMock).toHaveBeenCalledWith("call-1", "poll_incoming_absent");
  });

  it("조회 결과에 그대로 있으면 부르지 않는다", async () => {
    seedRinging("call-1");
    fetchMock.mockResolvedValue([
      { id: "call-1", status: "ringing", isMineInitiator: false, roomId: "room-1" } as CommunityMessengerCallSession,
    ]);
    stop = startCallV4IncomingDiscovery("me");
    await vi.advanceTimersByTimeAsync(0);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("울리는 통화가 없으면(유휴) 빠짐 확인을 하지 않는다", async () => {
    fetchMock.mockResolvedValue([]);
    stop = startCallV4IncomingDiscovery("me");
    await vi.advanceTimersByTimeAsync(2_000 * 3);
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
