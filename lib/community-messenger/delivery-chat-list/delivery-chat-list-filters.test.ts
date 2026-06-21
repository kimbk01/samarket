import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  deliveryChatOrderMatchesProgressFilter,
  filterDeliveryChatListItems,
} from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-filters";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

function item(room: Partial<CommunityMessengerRoomSummary>, id: string): UnifiedRoomListItem {
  const base: CommunityMessengerRoomSummary = {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "매장",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-05-04T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...room,
  };
  return {
    room: base,
    preview: "preview",
    previewKind: "message",
    callStatus: null,
    callKind: null,
    lastEventAt: base.lastMessageAt,
  };
}

describe("deliveryChatOrderMatchesProgressFilter", () => {
  it("active excludes completed and cancelled", () => {
    expect(deliveryChatOrderMatchesProgressFilter("preparing", "active")).toBe(true);
    expect(deliveryChatOrderMatchesProgressFilter("completed", "active")).toBe(false);
    expect(deliveryChatOrderMatchesProgressFilter("cancelled", "active")).toBe(false);
  });
});

describe("filterDeliveryChatListItems", () => {
  const items = [
    item(
      {
        id: "a",
        contextMeta: { v: 1, kind: "delivery", orderStatus: "preparing", storeDisplayName: "A" },
      },
      "a"
    ),
    item(
      {
        id: "b",
        contextMeta: { v: 1, kind: "delivery", orderStatus: "completed", storeDisplayName: "B" },
      },
      "b"
    ),
  ];

  it("filters completed", () => {
    const out = filterDeliveryChatListItems({ items, progressFilter: "completed" });
    expect(out.map((x) => x.room.id)).toEqual(["b"]);
  });
});
