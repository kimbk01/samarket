import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: vi.fn(async () => ({ ok: true, session: { id: "s1" } })),
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

vi.mock("@/lib/community-messenger/call-orchestrator", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/community-messenger/call-orchestrator")>();
  return {
    ...mod,
    logDibayCall: vi.fn(),
  };
});

import { patchCommunityMessengerCallSession } from "@/lib/community-messenger/call-http-actions";
import { tryClaimIncomingCallAccept } from "@/lib/community-messenger/incoming-call-action-guard";
import { runIncomingCallAccept } from "@/lib/community-messenger/incoming-call-accept-gateway";

describe("incoming-call-accept-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/calls/s1?action=accept&nativeAccept=1");
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
});

