/**
 * CUT-1 — terminal call_stub room-bump parity (projection only).
 * Does not change session terminal writer / Native / HL-B.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type RoomBumpArgs = {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
};

const publishBumpMock = vi.fn(async (_args: RoomBumpArgs) => {});

vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: (args: RoomBumpArgs) => publishBumpMock(args),
}));

import { appendCommunityMessengerCallStubMessage } from "@/lib/community-messenger/service";

type DevState = {
  rooms: Array<{ id: string; lastMessage?: string; lastMessageAt?: string; lastMessageType?: string }>;
  messages: Array<{
    id: string;
    roomId: string;
    senderId: string;
    messageType: string;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  participants: Array<{ roomId: string; userId: string; unreadCount: number }>;
  calls: unknown[];
  callSessions: unknown[];
};

function resetDevState(): DevState {
  const state: DevState = {
    rooms: [{ id: "room-1", lastMessage: "hi", lastMessageAt: "2026-06-01T00:00:00.000Z", lastMessageType: "text" }],
    messages: [],
    participants: [
      { roomId: "room-1", userId: "caller", unreadCount: 0 },
      { roomId: "room-1", userId: "callee", unreadCount: 0 },
    ],
    calls: [],
    callSessions: [],
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

function devState(): DevState {
  return (globalThis as unknown as { __samarketCommunityMessengerState: DevState }).__samarketCommunityMessengerState;
}

describe("CUT-1 terminal call_stub room-bump parity", () => {
  beforeEach(() => {
    resetDevState();
    publishBumpMock.mockClear();
  });

  it("publishes room-bump after successful terminal stub insert with correct room", async () => {
    await appendCommunityMessengerCallStubMessage({
      userId: "caller",
      roomId: "room-1",
      sessionId: "sess-cut1",
      callKind: "voice",
      status: "cancelled",
      createdAt: "2026-06-09T10:00:00.000Z",
      listActivityAt: "2026-06-09T10:00:30.000Z",
      bumpRoomLastMessageAt: true,
      endedReason: "canceled",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });

    expect(devState().messages).toHaveLength(1);
    expect(devState().messages[0]!.messageType).toBe("call_stub");
    expect(publishBumpMock).toHaveBeenCalledTimes(1);
    expect(publishBumpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawRouteRoomId: "room-1",
        canonicalRoomId: "room-1",
        fromUserId: "caller",
        messageCreatedAt: "2026-06-09T10:00:30.000Z",
        messageId: devState().messages[0]!.id,
      })
    );
  });

  it("keeps one stub on duplicate terminal proposals and does not explode bump count", async () => {
    const base = {
      userId: "caller",
      roomId: "room-1",
      sessionId: "sess-dup",
      callKind: "voice" as const,
      createdAt: "2026-06-09T10:00:00.000Z",
      listActivityAt: "2026-06-09T10:00:30.000Z",
      bumpRoomLastMessageAt: true,
      initiatorUserId: "caller",
      recipientUserId: "callee",
    };
    await appendCommunityMessengerCallStubMessage({
      ...base,
      status: "cancelled",
      endedReason: "canceled",
    });
    await appendCommunityMessengerCallStubMessage({
      ...base,
      userId: "callee",
      status: "missed",
      endedReason: "missed",
    });
    await appendCommunityMessengerCallStubMessage({
      ...base,
      status: "rejected",
      endedReason: "declined",
    });

    expect(devState().messages).toHaveLength(1);
    // One bump per successful projection write (insert + updates) — not combinatorial storm
    expect(publishBumpMock.mock.calls.length).toBe(3);
    for (const call of publishBumpMock.mock.calls) {
      const args = call[0] as RoomBumpArgs;
      expect(args).toEqual(
        expect.objectContaining({
          canonicalRoomId: "room-1",
          rawRouteRoomId: "room-1",
        })
      );
    }
  });

  it("does not publish room-bump when roomId is missing", async () => {
    await appendCommunityMessengerCallStubMessage({
      userId: "caller",
      roomId: null,
      sessionId: "sess-noroom",
      callKind: "voice",
      status: "ended",
      createdAt: "2026-06-09T10:00:00.000Z",
      listActivityAt: "2026-06-09T10:01:00.000Z",
    });
    expect(publishBumpMock).not.toHaveBeenCalled();
  });

  it("preserves callee unread increment on terminal insert", async () => {
    await appendCommunityMessengerCallStubMessage({
      userId: "caller",
      roomId: "room-1",
      sessionId: "sess-unread",
      callKind: "voice",
      status: "cancelled",
      createdAt: "2026-06-09T10:00:00.000Z",
      listActivityAt: "2026-06-09T10:00:30.000Z",
      incrementUnread: true,
      endedReason: "canceled",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });
    const callee = devState().participants.find((p) => p.userId === "callee");
    const caller = devState().participants.find((p) => p.userId === "caller");
    expect(callee?.unreadCount).toBe(1);
    expect(caller?.unreadCount).toBe(0);
  });
});
