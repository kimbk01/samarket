import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  filterTradeChatListItems,
  tradeChatListingMatchesProgressFilter,
} from "@/lib/community-messenger/trade-chat-list/trade-chat-list-filters";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);

function item(room: Partial<CommunityMessengerRoomSummary>, id: string): UnifiedRoomListItem {
  const base: CommunityMessengerRoomSummary = {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "상대",
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

describe("tradeChatListingMatchesProgressFilter", () => {
  it("active includes inquiry negotiating reserved", () => {
    expect(tradeChatListingMatchesProgressFilter("inquiry", "active")).toBe(true);
    expect(tradeChatListingMatchesProgressFilter("negotiating", "active")).toBe(true);
    expect(tradeChatListingMatchesProgressFilter("reserved", "active")).toBe(true);
    expect(tradeChatListingMatchesProgressFilter("completed", "active")).toBe(false);
  });
});

describe("filterTradeChatListItems", () => {
  const items = [
    item({ id: "a", contextMeta: { v: 1, kind: "trade", itemStateLabel: "판매중" } }, "a"),
    item({ id: "b", contextMeta: { v: 1, kind: "trade", itemStateLabel: "문의중" } }, "b"),
    item(
      {
        id: "c",
        isReadonly: true,
        contextMeta: {
          v: 1,
          kind: "trade",
          itemStateLabel: "판매완료",
          completedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      "c"
    ),
  ];

  it("preserves order when filtering active", () => {
    const out = filterTradeChatListItems({ items, progressFilter: "active", t });
    expect(out.map((x) => x.room.id)).toEqual(["a", "b"]);
  });

  it("filters completed only", () => {
    const out = filterTradeChatListItems({ items, progressFilter: "completed", t });
    expect(out.map((x) => x.room.id)).toEqual(["c"]);
  });

  it("returns all when filter is all", () => {
    const out = filterTradeChatListItems({ items, progressFilter: "all", t });
    expect(out.map((x) => x.room.id)).toEqual(["a", "b", "c"]);
  });
});
