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
      startedAt: new Date().toISOString(),
      answeredAt: null,
      endedAt: null,
      isMineInitiator: true,
      participants: [],
    } as CommunityMessengerCallSession,
  })),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return {
    ...actual,
    callV4ReconcileBeforeCreate: apiMocks.reconcile,
    callV4ResolveOutgoingRoomId: apiMocks.resolveRoom,
    callV4CreateSession: apiMocks.createSession,
  };
});

import { callV4CreateOutgoing } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4-create-outgoing", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    apiMocks.reconcile.mockClear();
    apiMocks.resolveRoom.mockClear();
    apiMocks.createSession.mockClear();
  });

  it("creates outgoing once and routes to calls-v4 screen", async () => {
    const replace = vi.fn();
    const result = await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace },
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.reconcile).toHaveBeenCalledTimes(1);
    expect(apiMocks.createSession).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/community-messenger/calls-v4/call-1?source=outgoing"
    );

    const state = useCallV4Store.getState();
    expect(state.phase).toBe("outgoing_ringing");
    expect(state.identity?.direction).toBe("outgoing");
    expect(state.identity?.callId).toBe("call-1");
  });
});
