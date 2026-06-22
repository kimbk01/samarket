import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: vi.fn(async () => ({ ok: true, session: { id: "s1" } })),
  fetchCommunityMessengerCallSessionByIdClient: vi.fn(async (id: string) => ({
    id,
    callKind: "voice",
    status: "ringing",
    isMineInitiator: false,
    endedReason: null,
  })),
}));

vi.mock("@/lib/community-messenger/incoming-call-action-guard", () => ({
  tryClaimIncomingCallAccept: vi.fn(() => true),
  releaseIncomingCallAccept: vi.fn(),
  tryClaimIncomingCallReject: vi.fn(() => true),
  releaseIncomingCallReject: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallMediaForUserGesture: vi.fn(async () => ({ ok: true, state: { camera: "granted", microphone: "granted" } })),
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

import { patchCommunityMessengerCallSession } from "@/lib/community-messenger/call-http-actions";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import { tryClaimIncomingCallAccept } from "@/lib/community-messenger/incoming-call-action-guard";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { postCommunityMessengerCallIncomingConsumedBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { isDibayCallConsumed, resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";
import {
  acceptIncomingCallOnce,
  runIncomingCallAccept,
  runIncomingCallReject,
  runNativePendingAcceptCall,
} from "@/lib/community-messenger/incoming-call-accept-gateway";
import { markCallConsumed } from "@/lib/community-messenger/incoming-call-state";

describe("incoming-call-accept-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDibayCallSessionState();
  });

  it("stops ring immediately on accept before PATCH", async () => {
    const router = { replace: vi.fn() };
    const session = {
      id: "s-immediate",
      callKind: "voice",
      status: "ringing",
      isMineInitiator: false,
      endedReason: null,
    } as any;

    await runIncomingCallAccept({ session, router, source: "incoming_banner_accept" });

    expect(dibayIncomingLaneStopRing).toHaveBeenCalledWith("accept_pressed_immediate", "s-immediate");
    expect(dismissAllIncomingCallNotificationsFireAndForget).toHaveBeenCalledWith("s-immediate");
    const stopOrder = vi.mocked(dibayIncomingLaneStopRing).mock.invocationCallOrder[0] ?? 0;
    const patchOrder = vi.mocked(patchCommunityMessengerCallSession).mock.invocationCallOrder[0] ?? 0;
    expect(stopOrder).toBeLessThan(patchOrder);
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
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      "/community-messenger/calls/s1?action=accept&nativeAccept=1&mode=active"
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
    (tryClaimIncomingCallAccept as any).mockReturnValueOnce(false);
    const router = { replace: vi.fn() };
    const session = { id: "s1", callKind: "voice", status: "ringing", isMineInitiator: false } as any;
    const res = await runIncomingCallAccept({ session, router, source: "incoming_banner_accept" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("duplicate_accept_blocked");
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledTimes(0);
    expect(router.replace).toHaveBeenCalledTimes(0);
  });

  it("runIncomingCallReject still PATCHes when optimistically consumed", async () => {
    markCallConsumed("s-reject", "declined");
    const res = await runIncomingCallReject({ sessionId: "s-reject", source: "incoming_banner_reject" });
    expect(res.ok).toBe(true);
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledWith("s-reject", "reject");
    expect(isDibayCallConsumed("s-reject")).toBe(true);
  });

  it("runIncomingCallReject applies consumed side effects when PATCH fails", async () => {
    (patchCommunityMessengerCallSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    const res = await runIncomingCallReject({ sessionId: "s-reject-fail", source: "incoming_banner_reject" });
    expect(res.ok).toBe(false);
    expect(isDibayCallConsumed("s-reject-fail")).toBe(true);
  });
});
