import { describe, expect, it } from "vitest";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  assertStoreOrderRoomBootstrapHasTimelineSeed,
  pickAuthoritativeMessengerRoomSnapshot,
} from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import { primeHotRoomSnapshot, primeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";

function snap(partial: Partial<CommunityMessengerRoomSnapshot> & { roomId: string; viewerUserId: string }): CommunityMessengerRoomSnapshot {
  return {
    myRole: partial.myRole ?? "member",
    room: {
      id: partial.roomId,
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "alias_allowed",
      isReadonly: false,
      title: "t",
      subtitle: "",
      summary: "",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: partial.room?.lastMessage ?? "",
      lastMessageAt: new Date().toISOString(),
      memberCount: 2,
      ownerUserId: null,
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
      contextMeta: partial.room?.contextMeta,
    },
    members: partial.members ?? [],
    messages: partial.messages ?? [],
    readReceipt: null,
    activeCall: null,
    ...partial,
  } as CommunityMessengerRoomSnapshot;
}

describe("pickAuthoritativeMessengerRoomSnapshot", () => {
  it("진입 게이트 시드가 빈 peek 캐시보다 우선한다", () => {
    const viewer = "owner-1";
    const roomId = "room-a";
    primeRoomSnapshot(roomId, snap({ roomId, viewerUserId: viewer, messages: [] }));
    const server = snap({
      roomId,
      viewerUserId: viewer,
      messages: [
        {
          id: "m1",
          roomId,
          senderId: "x",
          senderLabel: "x",
          messageType: "text",
          content: "hi",
          createdAt: "2026-01-01T00:00:00.000Z",
          isMine: false,
          clientMessageId: null,
          callKind: null,
          callStatus: null,
          callSessionId: null,
        },
      ],
    });
    const picked = pickAuthoritativeMessengerRoomSnapshot({
      roomId,
      viewerUserId: viewer,
      serverSnapshot: server,
    });
    expect(picked?.messages.length).toBe(1);
  });

  it("이탈 hot 캐시가 peek 보다 메시지가 많으면 hot 을 쓴다", () => {
    const viewer = "owner-1";
    const roomId = "room-hot";
    primeRoomSnapshot(
      roomId,
      snap({ roomId, viewerUserId: viewer, messages: [] })
    );
    primeHotRoomSnapshot(
      roomId,
      snap({
        roomId,
        viewerUserId: viewer,
        messages: [
          {
            id: "h1",
            roomId,
            senderId: "x",
            senderLabel: "x",
            messageType: "text",
            content: "cached",
            createdAt: "2026-01-02T00:00:00.000Z",
            isMine: false,
            clientMessageId: null,
            callKind: null,
            callStatus: null,
            callSessionId: null,
          },
        ],
      })
    );
    const picked = pickAuthoritativeMessengerRoomSnapshot({
      roomId,
      viewerUserId: viewer,
      serverSnapshot: null,
    });
    expect(picked?.messages.length).toBe(1);
    expect(picked?.messages[0]?.id).toBe("h1");
  });
});

describe("assertStoreOrderRoomBootstrapHasTimelineSeed", () => {
  it("delivery 방에 lastMessage 힌트만 있고 messages 가 비면 실패", () => {
    const bad = snap({
      roomId: "r1",
      viewerUserId: "u1",
      messages: [],
      room: {
        lastMessage: "hello",
        contextMeta: {
          v: 1,
          kind: "delivery",
          storeOrderId: "o1",
          storeId: "s1",
          headline: "h",
        },
      } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(assertStoreOrderRoomBootstrapHasTimelineSeed(bad).ok).toBe(false);
  });
});
