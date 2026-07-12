import { describe, expect, it } from "vitest";
import {
  patchBootstrapRoomListForCallStubPreviewUpdate,
  patchBootstrapRoomListForRealtimeMessageInsert,
} from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

function bootstrap(room: {
  id: string;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType?: string;
}): CommunityMessengerBootstrap {
  return {
    chats: [
      {
        id: room.id,
        title: "Peer",
        roomType: "direct",
        isPinned: false,
        unreadCount: 0,
        lastMessage: room.lastMessage,
        lastMessageAt: room.lastMessageAt,
        lastMessageType: (room.lastMessageType as "call_stub") ?? "call_stub",
      },
    ],
    groups: [],
    calls: [],
    friends: [],
    requests: [],
    me: { id: "me" },
    tabs: { chats: 1, groups: 0, calls: 0, friends: 0 },
  } as unknown as CommunityMessengerBootstrap;
}

describe("call stub home list preview patch", () => {
  const startedAt = "2026-06-09T10:00:00.000Z";
  const messageId = "msg-1";

  it("TEST 9: same message.id + status change updates preview without reorder bump", () => {
    const data = bootstrap({ id: "room-1", lastMessage: "발신 중", lastMessageAt: startedAt });
    const insertRow = {
      id: messageId,
      room_id: "room-1",
      sender_id: "user-1",
      message_type: "call_stub",
      content: "발신 중",
      metadata: { sessionId: "s1", callStatus: "dialing", callKind: "voice" },
      created_at: startedAt,
    };
    const afterInsert = patchBootstrapRoomListForRealtimeMessageInsert(data, "room-1", insertRow);
    expect(afterInsert.chats?.[0]?.lastMessage).toBe("발신 중");

    const terminalRow = {
      ...insertRow,
      content: "취소된 통화",
      metadata: { sessionId: "s1", callStatus: "cancelled", callKind: "voice" },
      created_at: startedAt,
    };
    const afterTerminal = patchBootstrapRoomListForRealtimeMessageInsert(afterInsert, "room-1", terminalRow);
    expect(afterTerminal.chats?.[0]?.lastMessage).toBe("취소된 통화");
    expect(afterTerminal.chats?.[0]?.lastMessageAt).toBe(startedAt);
    expect(afterTerminal.chats?.map((r) => r.id)).toEqual(afterInsert.chats?.map((r) => r.id));
  });

  it("keeps home preview when newer text message exists after call start (scenario B)", () => {
    const callStart = "2026-06-09T10:00:00.000Z";
    const textAt = "2026-06-09T10:00:05.000Z";
    const data = bootstrap({
      id: "room-1",
      lastMessage: "안녕하세요",
      lastMessageAt: textAt,
      lastMessageType: "text",
    });
    const patched = patchBootstrapRoomListForCallStubPreviewUpdate(data, "room-1", {
      lastMessage: "통화 종료",
      lastMessageType: "call_stub",
      lastMessageAt: callStart,
    });
    expect(patched).toBe(data);
    expect(patched.chats?.[0]?.lastMessage).toBe("안녕하세요");
    expect(patched.chats?.[0]?.lastMessageAt).toBe(textAt);
    expect(patched.chats?.[0]?.lastMessageType).toBe("text");
  });

  it("TEST 10: call_stub_preview patch does not change sort key", () => {
    const older = {
      id: "room-old",
      title: "Old",
      roomType: "direct" as const,
      isPinned: false,
      unreadCount: 0,
      lastMessage: "발신 중",
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      lastMessageType: "call_stub" as const,
    };
    const newer = {
      id: "room-new",
      title: "New",
      roomType: "direct" as const,
      isPinned: false,
      unreadCount: 0,
      lastMessage: "text",
      lastMessageAt: "2026-06-10T00:00:00.000Z",
      lastMessageType: "text" as const,
    };
    const data = {
      chats: [newer, older],
      groups: [],
      calls: [
        {
          id: "call-1",
          sessionId: "s-late",
          roomId: "room-old",
          startedAt: "2026-06-15T00:00:00.000Z",
          status: "missed",
          callKind: "voice",
        },
      ],
      friends: [],
      requests: [],
      me: { id: "me" },
      tabs: { chats: 2, groups: 0, calls: 1, friends: 0 },
    } as unknown as CommunityMessengerBootstrap;

    const patched = patchBootstrapRoomListForCallStubPreviewUpdate(data, "room-old", {
      lastMessage: "부재중",
      lastMessageType: "call_stub",
      lastMessageAt: "2026-06-01T00:00:00.000Z",
    });
    expect(patched.chats?.map((r) => r.id)).toEqual(["room-new", "room-old"]);
    expect(patched.chats?.[1]?.lastMessage).toBe("부재중");
  });
});
