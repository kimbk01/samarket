import { describe, expect, it } from "vitest";
import {
  buildTradeUnreadTargetIdentityKeys,
  resolveTradeListUnreadCount,
  TRADE_UNREAD_TARGET_TYPE,
} from "@/lib/messenger/trade/unread-from-notification-targets";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import type { TradeListItem } from "@/lib/messenger/trade/types";

function tradeRow(
  partial: Partial<TradeListItem> & { roomId: string; unreadCount: number }
): TradeListItem {
  return {
    roomId: partial.roomId,
    chatDomain: "trade",
    domainIdentityKey: partial.domainIdentityKey ?? `trade:item-${partial.roomId}:seller:buyer`,
    itemId: partial.itemId ?? `item-${partial.roomId}`,
    sellerUserId: partial.sellerUserId ?? "seller",
    counterpartyUserId: partial.counterpartyUserId ?? "buyer",
    viewerRole: partial.viewerRole ?? "buyer",
    itemTitle: partial.itemTitle ?? "Item",
    itemImageUrl: null,
    peerDisplayName: "Peer",
    peerAvatarUrl: null,
    productChatId: null,
    lastMessage: "hi",
    lastMessageIsSystem: false,
    lastMessageAt: "2026-08-03T00:00:00.000Z",
    unreadCount: partial.unreadCount,
    tradeStatusLabel: null,
    updatedAt: "2026-08-03T00:00:00.000Z",
    generation: "test",
  };
}

describe("trade row unread SSOT = participant count", () => {
  it("exposes trade target type for push/lifecycle only", () => {
    expect(TRADE_UNREAD_TARGET_TYPE).toBe("trade");
  });

  it("participant unread=4 with no target → row=4", () => {
    expect(
      resolveTradeListUnreadCount({
        participantUnreadCount: 4,
        domainIdentityKey: "trade:item:s:b",
        unreadTargetIdentityKeys: new Set(),
      })
    ).toBe(4);
  });

  it("participant unread=0 with target present → row=0", () => {
    expect(
      resolveTradeListUnreadCount({
        participantUnreadCount: 0,
        domainIdentityKey: "trade:item:s:b",
        unreadTargetIdentityKeys: new Set(["trade:item:s:b"]),
      })
    ).toBe(0);
  });

  it("participant unread=7 with target present → row=7 (no Math.max(1))", () => {
    expect(
      resolveTradeListUnreadCount({
        participantUnreadCount: 7,
        domainIdentityKey: "trade:item:s:b",
        unreadTargetIdentityKeys: new Set(["trade:item:s:b"]),
      })
    ).toBe(7);
  });

  it("bans attention padding: never forces 1 when participant is 0", () => {
    const src = resolveTradeListUnreadCount.toString();
    expect(src).not.toMatch(/Math\.max\s*\(\s*1\s*,/);
    expect(
      resolveTradeListUnreadCount({
        participantUnreadCount: 0,
        unreadTargetIdentityKeys: new Set(["trade:any"]),
      })
    ).toBe(0);
  });

  it("hub unreadRoomCount = count(rows where unread>0)", () => {
    const hub = buildTradeHubViewModel([
      tradeRow({ roomId: "a", unreadCount: 4 }),
      tradeRow({ roomId: "b", unreadCount: 0 }),
      tradeRow({ roomId: "c", unreadCount: 2 }),
    ]);
    expect(hub.unreadCount).toBe(2);
    expect(hub.roomCount).toBe(3);
  });

  it("buildTradeUnreadTargetIdentityKeys still filters for push lifecycle", () => {
    const keys = buildTradeUnreadTargetIdentityKeys([
      {
        domain_identity_key: "trade:item-1:seller-a:buyer-b",
        target_type: "trade",
        chat_domain: "trade",
        is_unread: true,
      },
      {
        domain_identity_key: "trade:item-2:seller-c:buyer-d",
        target_type: "trade",
        chat_domain: "trade",
        is_unread: false,
      },
    ]);
    expect([...keys]).toEqual(["trade:item-1:seller-a:buyer-b"]);
  });
});
