import { beforeEach, describe, expect, it } from "vitest";
import { appendCommunityMessengerCallStubMessage } from "@/lib/community-messenger/service";

type DevState = {
  rooms: Array<{
    id: string;
    lastMessage?: string;
    lastMessageAt?: string;
    lastMessageType?: string;
  }>;
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
    participants: [],
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

const STARTED_AT = "2026-06-09T10:00:00.000Z";
const SESSION_A = "session-a";
const SESSION_B = "session-b";

describe("appendCommunityMessengerCallStubMessage (dev SSOT)", () => {
  beforeEach(() => {
    resetDevState();
  });

  async function insertDialing(sessionId: string, createdAt = STARTED_AT) {
    await appendCommunityMessengerCallStubMessage({
      userId: "user-1",
      roomId: "room-1",
      sessionId,
      callKind: "voice",
      status: "dialing",
      createdAt,
      bumpRoomLastMessageAt: true,
    });
  }

  it("TEST 4: terminal UPDATE keeps message created_at", async () => {
    await insertDialing(SESSION_A);
    const dev = devState();
    const before = dev.messages[0]!.createdAt;

    await appendCommunityMessengerCallStubMessage({
      userId: "user-1",
      roomId: "room-1",
      sessionId: SESSION_A,
      callKind: "voice",
      status: "cancelled",
      createdAt: "2026-06-09T10:05:00.000Z",
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: false,
    });

    expect(dev.messages).toHaveLength(1);
    expect(dev.messages[0]!.createdAt).toBe(before);
    expect(dev.messages[0]!.metadata.callStatus).toBe("cancelled");
  });

  it("TEST 5: terminal UPDATE keeps rooms.last_message_at", async () => {
    await insertDialing(SESSION_A);
    const dev = devState();
    const roomAtBefore = dev.rooms[0]!.lastMessageAt;

    await appendCommunityMessengerCallStubMessage({
      userId: "user-1",
      roomId: "room-1",
      sessionId: SESSION_A,
      callKind: "voice",
      status: "ended",
      createdAt: "2026-06-09T10:05:00.000Z",
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: false,
      durationSeconds: 12,
    });

    expect(dev.rooms[0]!.lastMessageAt).toBe(roomAtBefore);
  });

  it("terminal UPDATE skips room preview when newer last_message_at exists", async () => {
    await insertDialing(SESSION_A);
    const dev = devState();
    dev.rooms[0]!.lastMessageAt = "2026-06-09T10:00:05.000Z";
    dev.rooms[0]!.lastMessage = "안녕";
    dev.rooms[0]!.lastMessageType = "text";

    await appendCommunityMessengerCallStubMessage({
      userId: "user-1",
      roomId: "room-1",
      sessionId: SESSION_A,
      callKind: "voice",
      status: "ended",
      createdAt: STARTED_AT,
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: false,
      durationSeconds: 8,
    });

    expect(dev.rooms[0]!.lastMessage).toBe("안녕");
    expect(dev.rooms[0]!.lastMessageType).toBe("text");
    expect(dev.messages[0]!.metadata.callStatus).toBe("ended");
  });

  it("TEST 7: same sessionId terminal twice keeps one stub", async () => {
    await insertDialing(SESSION_A);
    await appendCommunityMessengerCallStubMessage({
      userId: "user-1",
      roomId: "room-1",
      sessionId: SESSION_A,
      callKind: "voice",
      status: "cancelled",
      createdAt: STARTED_AT,
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: false,
    });
    await appendCommunityMessengerCallStubMessage({
      userId: "user-1",
      roomId: "room-1",
      sessionId: SESSION_A,
      callKind: "voice",
      status: "cancelled",
      createdAt: STARTED_AT,
      replaceExisting: true,
      incrementUnread: false,
      bumpRoomLastMessageAt: false,
    });
    expect(devState().messages).toHaveLength(1);
  });

  it("TEST 8: two different sessionIds keep two stubs", async () => {
    await insertDialing(SESSION_A);
    await insertDialing(SESSION_B, "2026-06-09T11:00:00.000Z");
    const dev = devState();
    expect(dev.messages).toHaveLength(2);
    const sessionIds = dev.messages.map((m) => m.metadata.sessionId).sort();
    expect(sessionIds).toEqual([SESSION_A, SESSION_B].sort());
  });
});
