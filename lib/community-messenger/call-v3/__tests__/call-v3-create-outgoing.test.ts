import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const apiMocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => undefined),
  resolveRoom: vi.fn(async () => ({ ok: true as const, roomId: "room-1" })),
  createSession: vi.fn(async () => ({
    ok: true,
    session: {
      id: "call-1",
      roomId: "room-1",
      sessionMode: "direct",
      initiatorUserId: "user-a",
      recipientUserId: "user-b",
      peerUserId: "user-b",
      peerLabel: "Peer",
      callKind: "voice",
      status: "ringing",
      startedAt: "2026-06-23T00:00:00.000Z",
      answeredAt: null,
      endedAt: null,
      isMineInitiator: true,
      participants: [],
    } as CommunityMessengerCallSession,
  })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3ReconcileBeforeCreate: apiMocks.reconcile,
  callV3ResolveOutgoingRoomId: apiMocks.resolveRoom,
  callV3CreateSession: apiMocks.createSession,
  callV3MediaTypeFromKind: (kind: string) => (kind === "video" ? "video" : "audio"),
}));

vi.mock("@/lib/auth/assert-phone-verified-for-messenger-action-client", () => ({
  assertPhoneVerifiedForMessengerActionOrOpenSheet: () => true,
  resolveMessengerActionReturnPath: () => "/community-messenger",
}));

vi.mock("@/lib/community-messenger/call-phase0-basics", () => ({
  isCmCallVideoEnabled: () => true,
}));

import { callV3CreateOutgoing } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-create-outgoing", () => {
  beforeEach(() => {
    useCallV3Store.getState().resetToIdle();
    apiMocks.reconcile.mockClear();
    apiMocks.resolveRoom.mockClear();
    apiMocks.createSession.mockClear();
  });

  it("creates outgoing once and routes to calls-v3", async () => {
    const push = vi.fn();
    const result = await callV3CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push },
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.reconcile).toHaveBeenCalledTimes(1);
    expect(apiMocks.createSession).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/community-messenger/calls-v3/call-1");

    const state = useCallV3Store.getState();
    expect(state.phase).toBe("outgoing_ringing");
    expect(state.identity?.callId).toBe("call-1");
  });
});
