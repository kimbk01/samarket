import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/call/call-actions", () => ({
  patchCommunityMessengerCallSession: vi.fn(async (_id: string) => ({
    ok: true,
    session: { id: "s1", status: "active" },
  })),
}));

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  fetchCommunityMessengerCallSessionByIdClient: vi.fn(async (id: string) => ({
    id,
    callKind: "voice",
    status: "ringing",
    isMineInitiator: false,
    endedReason: null,
  })),
}));

vi.mock("@/lib/call/actions/call-accept-guard", () => ({
  runCallAcceptGuard: vi.fn(async (input: {
    session: { id: string };
    router: { replace: (href: string) => void };
    hrefOverride?: string;
  }) => {
    const { patchCommunityMessengerCallSession } = await import("@/lib/call/call-actions");
    await patchCommunityMessengerCallSession(input.session.id, "accept");
    const href =
      input.hrefOverride ??
      `/community-messenger/calls/${encodeURIComponent(input.session.id)}?action=accept&nativePrep=1&mode=active`;
    input.router.replace(href);
    return {
      ok: true,
      sessionId: input.session.id,
      session: { ...input.session, status: "active" },
      permission: { ok: true },
    };
  }),
}));

vi.mock("@/lib/community-messenger/incoming-call-action-guard", () => ({
  tryClaimIncomingCallAccept: vi.fn(() => true),
  releaseIncomingCallAccept: vi.fn(),
  tryClaimIncomingCallReject: vi.fn(() => true),
  releaseIncomingCallReject: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  rememberCallNavigationReturnPath: vi.fn(),
  primeCommunityMessengerCallNavigationSeed: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

vi.mock("@/lib/community-messenger/native-callee-accept-entry", () => ({
  markNativeCalleeAcceptPending: vi.fn(),
}));

vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  postCommunityMessengerCallIncomingConsumedBusEvent: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-orchestrator", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/community-messenger/call-orchestrator")>();
  return {
    ...mod,
    logDibayCall: vi.fn(),
  };
});

import { patchCommunityMessengerCallSession } from "@/lib/call/call-actions";
import { runCallAcceptGuard } from "@/lib/call/actions/call-accept-guard";
import { tryClaimIncomingCallAccept } from "@/lib/community-messenger/incoming-call-action-guard";
import { postCommunityMessengerCallIncomingConsumedBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { isDibayCallConsumed, resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";
import {
  acceptIncomingCallOnce,
  runIncomingCallAccept,
  runNativePendingAcceptCall,
} from "@/lib/community-messenger/incoming-call-accept-gateway";

describe("incoming-call-accept-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDibayCallSessionState();
  });

  it("PATCH accept is executed once per invocation (single gateway)", async () => {
    const router = { replace: vi.fn() };
    const session = {
      id: "s1",
      callKind: "voice",
      status: "ringing",
      isMineInitiator: false,
      endedReason: null,
    } as any;

    await runIncomingCallAccept({ session, router, source: "incoming_banner_accept" });
    expect(runCallAcceptGuard).toHaveBeenCalledTimes(1);
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      "/community-messenger/calls/s1?action=accept&nativePrep=1&mode=active",
    );
    expect(isDibayCallConsumed("s1")).toBe(true);
    expect(postCommunityMessengerCallIncomingConsumedBusEvent).toHaveBeenCalledWith("s1", "accepted");
  });

  it("acceptIncomingCallOnce delegates to gateway", async () => {
    const router = { replace: vi.fn() };
    const session = {
      id: "s2",
      callKind: "voice",
      status: "ringing",
      isMineInitiator: false,
      endedReason: null,
    } as any;
    const res = await acceptIncomingCallOnce({ session, router, source: "incoming_banner_accept" });
    expect(res.ok).toBe(true);
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(1);
  });

  it("runNativePendingAcceptCall fetches session then PATCHes once via gateway", async () => {
    const router = { replace: vi.fn() };
    const res = await runNativePendingAcceptCall(router, "s3", "native_notification_accept");
    expect(res.ok).toBe(true);
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(isDibayCallConsumed("s3")).toBe(true);
  });

  it("duplicate_accept_blocked returns ok=false and does not patch", async () => {
    vi.mocked(runCallAcceptGuard).mockResolvedValueOnce({
      ok: false,
      sessionId: "s1",
      reason: "duplicate_accept_blocked",
    });
    const router = { replace: vi.fn() };
    const session = { id: "s1", callKind: "voice", status: "ringing", isMineInitiator: false } as any;
    const res = await runIncomingCallAccept({ session, router, source: "incoming_banner_accept" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("duplicate_accept_blocked");
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(0);
    expect(router.replace).toHaveBeenCalledTimes(0);
  });
});
