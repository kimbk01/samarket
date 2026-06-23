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
import { clearAllCallV4NativeAcceptingSurfaces } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
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

describe("call-v4 incoming discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCallV4NativeAcceptingSurfaces();
    useCallV4Store.getState().resetToIdle();
    vi.mocked(callV4FetchIncomingSessions).mockResolvedValue([ringingSession]);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("discovers foreground incoming and logs web_foreground owner without native_foreground_owner suppress", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    startCallV4IncomingDiscovery("user-b");
    await vi.waitFor(() => {
      expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
    });
    expect(callV4IncomingDiscovered).toHaveBeenCalledWith(ringingSession);
    const ownerLog = info.mock.calls.find(
      (call) => call[1] === "incoming_owner_decided" && (call[2] as { owner?: string })?.owner === "web_foreground",
    );
    expect(ownerLog).toBeDefined();
    const suppressed = info.mock.calls.find(
      (call) =>
        call[1] === "incoming_discovery_suppressed" &&
        (call[2] as { reason?: string })?.reason === "native_foreground_owner",
    );
    expect(suppressed).toBeUndefined();
    info.mockRestore();
  });
});
