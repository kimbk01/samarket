/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSession: vi.fn(),
}));

import { hydrateCallV4CalleeScreen } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { setNativeAcceptInflight, resetNativeAcceptInflightForTests } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingSession(callId: string): CommunityMessengerCallSession {
  return {
    id: callId,
    roomId: "room-1",
    status: "ringing",
    isMineInitiator: false,
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    startedAt: new Date().toISOString(),
  } as CommunityMessengerCallSession;
}

describe("hydrateCallV4CalleeScreen native accept inflight", () => {
  beforeEach(() => {
    resetNativeAcceptInflightForTests();
    useCallV4Store.getState().resetToIdle();
    vi.mocked(callV4FetchSession).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("does not restore incoming_ringing when server is still ringing and inflight is true", async () => {
    setNativeAcceptInflight("call-hydrate", "native_accept");
    vi.mocked(callV4FetchSession).mockResolvedValue(ringingSession("call-hydrate"));

    const hydrated = await hydrateCallV4CalleeScreen("call-hydrate");
    expect(hydrated).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("joining");
    expect(useCallV4Store.getState().phase).not.toBe("incoming_ringing");
  });
});
