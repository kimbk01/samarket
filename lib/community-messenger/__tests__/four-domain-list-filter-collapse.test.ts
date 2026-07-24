import { describe, expect, it } from "vitest";
import { matchesGroupChatListKindFilter } from "@/lib/community-messenger/group/group-room-notification-policy";
import { messengerDirectThreadListCollapseKey } from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(
  partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">
): CommunityMessengerRoomSummary {
  return {
    roomType: "direct",
    title: "",
    peerUserId: null,
    chatDomain: null,
    messengerDirectKey: null,
    contextMeta: null,
    unreadCount: 0,
    lastMessageAt: null,
    lastMessage: null,
    lastMessageType: null,
    ...partial,
  } as CommunityMessengerRoomSummary;
}

describe("four-domain list filter / collapse", () => {
  const peer = "peer-1";

  it("does not collapse trade/SO with general_direct peer", () => {
    const gd = room({
      id: "gd",
      peerUserId: peer,
      chatDomain: "general_direct",
    });
    const trade = room({
      id: "tr",
      peerUserId: peer,
      chatDomain: "trade",
      messengerDirectKey: "trade_pc:pc1",
    });
    const so = room({
      id: "so",
      peerUserId: peer,
      chatDomain: "store_order",
      messengerDirectKey: "store_order:o1",
    });
    expect(messengerDirectThreadListCollapseKey(gd)).toBe(`direct:${peer}`);
    expect(messengerDirectThreadListCollapseKey(trade)).toBe("id:tr");
    expect(messengerDirectThreadListCollapseKey(so)).toBe("id:so");
  });

  it("direct filter excludes trade/store_order even if roomType=direct", () => {
    const trade = room({ id: "tr", chatDomain: "trade" });
    const so = room({ id: "so", chatDomain: "store_order" });
    const gd = room({ id: "gd", chatDomain: "general_direct" });
    expect(matchesGroupChatListKindFilter(trade, "direct")).toBe(false);
    expect(matchesGroupChatListKindFilter(so, "direct")).toBe(false);
    expect(matchesGroupChatListKindFilter(gd, "direct")).toBe(true);
  });

  it("trade/delivery filters use chatDomain SSOT", () => {
    const trade = room({ id: "tr", chatDomain: "trade" });
    const so = room({ id: "so", chatDomain: "store_order" });
    expect(matchesGroupChatListKindFilter(trade, "trade")).toBe(true);
    expect(matchesGroupChatListKindFilter(so, "delivery")).toBe(true);
    expect(matchesGroupChatListKindFilter(trade, "delivery")).toBe(false);
  });
});
