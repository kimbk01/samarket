import { describe, expect, it } from "vitest";
import {
  classifyGlobalSearchChatRoom,
  filterMembershipRoomsForGlobalSearch,
} from "@/lib/search/global/adapters/chat-search-adapter";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(
  overrides: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id" | "title">
): CommunityMessengerRoomSummary {
  return {
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...overrides,
  } as CommunityMessengerRoomSummary;
}

describe("global chat search adapter", () => {
  it("splits direct / group / trade / order and hides archived", () => {
    const rooms = [
      room({ id: "d1", title: "치킨 direct", roomType: "direct", chatDomain: "general_direct" }),
      room({ id: "g1", title: "치킨 group", roomType: "private_group", chatDomain: "group" }),
      room({ id: "t1", title: "치킨 trade", roomType: "direct", chatDomain: "trade" }),
      room({ id: "o1", title: "치킨 order", roomType: "direct", chatDomain: "store_order" }),
      room({
        id: "a1",
        title: "치킨 archived",
        roomType: "direct",
        chatDomain: "general_direct",
        isArchivedByViewer: true,
      }),
    ];
    const hits = filterMembershipRoomsForGlobalSearch(rooms, "치킨");
    expect(hits.map((h) => `${h.kind}:${h.room.id}`)).toEqual([
      "direct:d1",
      "group:g1",
      "trade:t1",
      "order:o1",
    ]);
    expect(classifyGlobalSearchChatRoom(rooms[4]!)).toBeNull();
  });

  it("does not match message-body-only text outside allowed preview fields", () => {
    const rooms = [
      room({
        id: "secret",
        title: "peer",
        subtitle: "",
        summary: "",
        lastMessage: "",
        roomType: "direct",
        chatDomain: "general_direct",
      }),
    ];
    expect(filterMembershipRoomsForGlobalSearch(rooms, "secret-body")).toEqual([]);
    expect(
      filterMembershipRoomsForGlobalSearch(
        [
          room({
            id: "ok",
            title: "peer",
            lastMessage: "secret-body preview",
            roomType: "direct",
            chatDomain: "general_direct",
          }),
        ],
        "secret-body"
      )
    ).toHaveLength(1);
  });
});
