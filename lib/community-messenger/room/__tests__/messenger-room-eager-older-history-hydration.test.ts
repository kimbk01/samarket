import { describe, expect, it } from "vitest";
import { shouldEagerHydrateMessengerRoomOlderHistory } from "@/lib/community-messenger/room/use-messenger-room-eager-older-history-hydration";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function snapshot(
  room: Partial<CommunityMessengerRoomSnapshot["room"]>
): CommunityMessengerRoomSnapshot {
  return {
    room: {
      id: "room-1",
      roomType: "direct",
      title: "Room",
      summary: null,
      lastMessage: "call",
      lastMessageAt: null,
      ownerUserId: null,
      avatarUrl: null,
      memberCount: 2,
      roomStatus: "active",
      isReadonly: false,
      isArchived: false,
      isMuted: false,
      isPinned: false,
      pinnedMessageId: null,
      myIdentityMode: null,
      messengerDirectKey: null,
      contextMeta: null,
      ...room,
    },
    viewerUserId: "viewer",
    members: [],
    messages: Array.from({ length: 24 }, (_, i) => ({
      id: `m-${i}`,
      roomId: "room-1",
      senderId: "viewer",
      senderLabel: "Viewer",
      messageType: "call_stub",
      content: "video call rejected",
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      isMine: true,
    })),
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadAt: null,
    myRole: "member",
    activeCall: null,
    canInvite: false,
    canUpload: true,
    canCall: true,
    membersDeferred: false,
    membersTruncated: false,
    hasMoreOlderMessages: true,
    bootstrapInitialMessageLimit: 24,
  } as CommunityMessengerRoomSnapshot;
}

describe("shouldEagerHydrateMessengerRoomOlderHistory", () => {
  it("does not eager hydrate normal call-heavy messenger rooms", () => {
    expect(
      shouldEagerHydrateMessengerRoomOlderHistory({
        snapshot: snapshot({}),
        roomMessageCount: 24,
      })
    ).toBe(false);
  });

  it("keeps eager hydration for delivery/store-order rooms", () => {
    expect(
      shouldEagerHydrateMessengerRoomOlderHistory({
        snapshot: snapshot({
          contextMeta: { v: 1, kind: "delivery", storeOrderId: "order-1" },
        }),
        roomMessageCount: 24,
      })
    ).toBe(true);
  });
});
