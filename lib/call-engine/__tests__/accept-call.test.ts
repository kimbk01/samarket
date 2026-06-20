/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const patchMock = vi.fn();
const fetchMock = vi.fn();
const joinMock = vi.fn();

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: (...args: unknown[]) => patchMock(...args),
  fetchCommunityMessengerCallSessionByIdClient: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("@/lib/community-messenger/incoming-call-action-guard", () => ({
  tryClaimIncomingCallAccept: () => true,
  releaseIncomingCallAccept: () => {},
}));

vi.mock("@/lib/community-messenger/incoming-call-state", () => ({
  isDibayCallConsumed: () => false,
}));

vi.mock("@/lib/call/active-call-session", () => ({
  getActiveCallSessionCallId: () => null,
  setActiveCallSession: vi.fn(),
}));

vi.mock("@/lib/call/map-session-to-active-call", () => ({
  mapSessionStatusToActiveCallPhase: () => "connecting",
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  rememberCallNavigationReturnPath: vi.fn(),
  primeCommunityMessengerCallNavigationSeed: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-accept-hydrate-peer", () => ({
  writeCallAcceptHydratePeerFromSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-connection-prefetch", () => ({
  primeCommunityMessengerCallConnectionPrefetch: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
}));

vi.mock("@/lib/community-messenger/incoming-call-consumed-side-effects", () => ({
  applyIncomingCallConsumedSideEffects: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

vi.mock("@/lib/call-engine/call-ring-controller", () => ({
  stopCallEngineRing: vi.fn(),
  syncCallEngineRingFromState: vi.fn(),
}));

vi.mock("@/lib/call-engine/call-agora-lifecycle", () => ({
  joinCallSessionOnce: (...args: unknown[]) => joinMock(...args),
}));

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
}));

import { acceptCall, resetAcceptCallEngineForTests } from "@/lib/call-engine/accept-call";

const baseSession = {
  id: "sess-1",
  roomId: "room-1",
  peerUserId: "peer-1",
  initiatorUserId: "caller-1",
  recipientUserId: "peer-1",
  peerLabel: "Peer",
  status: "ringing",
  callKind: "voice",
  isMineInitiator: false,
  sessionMode: "direct",
  startedAt: new Date().toISOString(),
  answeredAt: null,
  endedAt: null,
  participants: [],
} as CommunityMessengerCallSession;

describe("acceptCall engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAcceptCallEngineForTests();
    joinMock.mockResolvedValue(true);
    patchMock.mockResolvedValue({ ok: true, session: { ...baseSession, status: "active" } });
    fetchMock.mockResolvedValue(baseSession);
  });

  it("PATCH accept exactly once per callId", async () => {
    const router = { replace: vi.fn() };
    const result = await acceptCall("sess-1", "incoming_banner", {
      router,
      session: baseSession,
    });
    expect(result.ok).toBe(true);
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledWith("sess-1", "accept", undefined, expect.any(Object));
    expect(joinMock).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/calls/sess-1");
  });

  it("skips duplicate PATCH when session already active", async () => {
    const activeSession = { ...baseSession, status: "active" as const };
    const result = await acceptCall("sess-1", "call_client", {
      skipRouteReplace: true,
      session: activeSession,
    });
    expect(result.ok).toBe(true);
    expect(patchMock).not.toHaveBeenCalled();
    expect(joinMock).toHaveBeenCalledTimes(1);
  });
});
