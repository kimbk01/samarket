/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({
  isCallV4TelegramLaneEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchIncomingSessions: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  callV4IncomingDiscovered: vi.fn(),
}));

import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import { startCallV4IncomingDiscovery } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import {
  applyCallV4SurfaceOwnerSignal,
  clearAllCallV4NativeAcceptingSurfaces,
  clearCallV4SurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const ringingSession: CommunityMessengerCallSession = {
  id: "call-in-1",
  roomId: "room-1",
  status: "ringing",
  isMineInitiator: false,
  initiatorUserId: "user-a",
  recipientUserId: "user-b",
  peerUserId: "user-a",
  peerLabel: "Caller",
  callKind: "voice",
  startedAt: new Date().toISOString(),
} as CommunityMessengerCallSession;

describe("call-v4 incoming discovery Phase6A", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCallV4NativeAcceptingSurfaces();
    clearCallV4SurfaceOwner("call-in-1", "test_reset");
    useCallV4Store.getState().resetToIdle();
    vi.mocked(callV4FetchIncomingSessions).mockResolvedValue([ringingSession]);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("does not discover without web_in_app owner bridge", async () => {
    startCallV4IncomingDiscovery("user-b");
    await vi.waitFor(() => {
      expect(callV4FetchIncomingSessions).toHaveBeenCalled();
    });
    expect(callV4IncomingDiscovered).not.toHaveBeenCalled();
  });

  it("discovers when web_in_app owner is set", async () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-in-1",
      owner: "web_in_app",
      reason: "fcm_push_delivery",
      ts: Date.now(),
    });
    startCallV4IncomingDiscovery("user-b");
    await vi.waitFor(() => {
      expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
    });
    expect(callV4IncomingDiscovered).toHaveBeenCalledWith(ringingSession);
  });
});
