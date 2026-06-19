import { describe, expect, it, beforeEach } from "vitest";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { patchBootstrapRoomListForRealtimeMessageInsert } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import {
  clearMessengerConsistencyStateForTests,
  getRoomTruthVersionMs,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(id: string, unread = 0, lastMessageAt = "2026-06-01T00:00:00.000Z"): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: id,
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: unread,
    lastMessage: "hi",
    lastMessageType: "text",
    lastMessageAt,
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: null,
    contextMeta: null,
  };
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: null,
    tabs: { friends: 0, chats: chats.length, groups: 0, calls: 0 },
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [],
    chats,
    groups: [],
    discoverableGroups: [],
    calls: [],
  };
}

describe("patch-bootstrap-room-list truth version", () => {
  beforeEach(() => {
    clearMessengerConsistencyStateForTests();
  });

  it("bumps room truth on realtime message insert", () => {
    const data = bootstrap([room("room-a")]);
    const next = patchBootstrapRoomListForRealtimeMessageInsert(data, "room-a", {
      id: "m1",
      room_id: "room-a",
      sender_id: "peer",
      message_type: "text",
      content: "new",
      created_at: "2026-06-05T12:00:00.000Z",
    });
    expect(next.chats[0]?.lastMessageAt).toBe("2026-06-05T12:00:00.000Z");
    expect(getRoomTruthVersionMs("room-a")).toBe(Date.parse("2026-06-05T12:00:00.000Z"));
  });

  it("home_sync replace does not resurrect unread after realtime message truth bump", () => {
    const base = bootstrap([room("room-a", 0, "2026-06-05T12:00:00.000Z")]);
    const afterRt = patchBootstrapRoomListForRealtimeMessageInsert(base, "room-a", {
      id: "m-rt-2",
      room_id: "room-a",
      sender_id: "peer",
      message_type: "text",
      content: "new",
      created_at: "2026-06-05T12:00:00.000Z",
    }, { boostUnreadCount: true });

    expect(afterRt.chats[0]?.unreadCount).toBe(1);

    const staleSync = applyHomeListPatch(
      afterRt,
      {
        kind: "home_sync",
        chats: [room("room-a", 2, "2026-06-04T12:00:00.000Z")],
        roomMode: "replace",
      },
      "home-sync"
    );

    expect(staleSync?.chats[0]?.unreadCount).toBe(1);
    expect(staleSync?.chats[0]?.lastMessageAt).toBe("2026-06-05T12:00:00.000Z");
  });
});
