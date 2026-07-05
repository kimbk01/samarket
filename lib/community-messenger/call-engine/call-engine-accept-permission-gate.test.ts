import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import type { CallMediaPermissionPreflightResult } from "@/lib/community-messenger/call-media-permission-preflight";
import {
  dispatchCallEngineSignal,
  resetCallEngineControllerForTests,
} from "@/lib/community-messenger/call-engine/call-engine-controller";
import { resetCallEngineLocksForTests } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { resetCallEngineStateForTests } from "@/lib/community-messenger/call-engine/call-engine-state";
import { resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";

const grantedPreflight: CallMediaPermissionPreflightResult = {
  ok: true,
  state: { microphone: "granted", camera: "granted", requestedAt: null, grantedAt: null, source: null },
};

const ensureCallMediaForUserGestureMock = vi.hoisted(() =>
  vi.fn<() => Promise<CallMediaPermissionPreflightResult>>(async () => grantedPreflight),
);
const callEngineAcceptIncomingMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallMediaForUserGesture: ensureCallMediaForUserGestureMock,
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-engine/call-engine-actions")>();
  return {
    ...actual,
    callEngineAcceptIncoming: callEngineAcceptIncomingMock,
  };
});

vi.mock("@/lib/community-messenger/call-orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-orchestrator")>();
  return {
    ...actual,
    logDibayCall: vi.fn(),
  };
});

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  rememberCallNavigationReturnPath: vi.fn(),
  primeCommunityMessengerCallNavigationSeed: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-connection-prefetch", () => ({
  primeCommunityMessengerCallConnectionPrefetch: vi.fn(),
}));

vi.mock("@/lib/community-messenger/native-callee-accept-entry", () => ({
  markNativeCalleeAcceptPending: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  postCommunityMessengerCallIncomingConsumedBusEvent: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-ringtone-owner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-engine/call-engine-ringtone-owner")>();
  return {
    ...actual,
    stopCallEngineIncomingRingtone: vi.fn(),
  };
});

vi.mock("@/lib/call/active-call-session", () => ({
  getActiveCallSessionCallId: vi.fn(() => null),
  hardClearActiveCallSession: vi.fn(async () => undefined),
  setActiveCallSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  fetchCommunityMessengerCallSessionByIdClient: vi.fn(async (id: string) => ({
    id,
    roomId: "room-1",
    peerUserId: "caller",
    callKind: "voice",
    status: "active",
    isMineInitiator: false,
  })),
}));

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "caller",
    recipientUserId: "self",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  };
}

describe("call-engine accept permission gate", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
    resetDibayCallSessionState();
    resetCallEngineControllerForTests();
    ensureCallMediaForUserGestureMock.mockReset();
    callEngineAcceptIncomingMock.mockReset();
    ensureCallMediaForUserGestureMock.mockResolvedValue(grantedPreflight);
    callEngineAcceptIncomingMock.mockResolvedValue({ ok: true });
  });

  it("blocks PATCH when media permission gate fails", async () => {
    ensureCallMediaForUserGestureMock.mockResolvedValue({
      ok: false,
      reason: "permission_denied",
      state: { microphone: "denied", camera: "granted", requestedAt: null, grantedAt: null, source: null },
    });
    const router = { replace: vi.fn() };
    const res = await dispatchCallEngineSignal({
      type: "user_accept",
      session: ringingSession("perm-deny"),
      router,
      source: "incoming_banner_accept",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("permission_denied");
    expect(callEngineAcceptIncomingMock).not.toHaveBeenCalled();
  });

  it("runs PATCH when media permission gate passes", async () => {
    const router = { replace: vi.fn() };
    const res = await dispatchCallEngineSignal({
      type: "user_accept",
      session: ringingSession("perm-ok"),
      router,
      source: "incoming_banner_accept",
    });
    expect(res.ok).toBe(true);
    expect(ensureCallMediaForUserGestureMock).toHaveBeenCalledWith("voice");
    expect(callEngineAcceptIncomingMock).toHaveBeenCalled();
  });
});
