import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectSurfacesFromConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { resolveTradeListUnreadCount } from "@/lib/messenger/trade/unread-from-notification-targets";
import { resolveStoreOrderListUnreadCount } from "@/lib/messenger/store-order/unread-from-notification-targets";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Trade/Customer Order unread SSOT contracts", () => {
  it("home pillar uses Domain unread room counts — not chatUnread / buyerOrderAttention", () => {
    const src = read("components/community-messenger/MessengerPillarSummaryRow.tsx");
    expect(src).toContain("peekDomainTradeUnreadRoomCount");
    expect(src).toContain("peekDomainStoreOrderUnreadRoomCount");
    expect(src).not.toContain("hub.chatUnread");
    expect(src).not.toContain("buyerOrderAttention");
    expect(src).not.toContain("useOwnerHubBadgeBreakdown");
  });

  it("live loaders wire participant unread into row resolvers", () => {
    const src = read("lib/messenger/contracts/phase11b-live-domain-loaders.ts");
    expect(src).toContain("resolveTradeListUnreadCount");
    expect(src).toContain("participantUnreadCount: p.unread_count");
    expect(src).toContain("store_order_customer_participant_unread");
    expect(src).toContain("participantUnreadCount: unreadByRoomId.get");
    expect(src).not.toMatch(/Badge SSOT: trade targets/);
    expect(src).not.toMatch(/Badge SSOT: buyer_order targets/);
  });

  it("Bottom = GD+Group+Trade+Customer Order room count", () => {
    const auth = resolveMemberConversationAuthority("viewer-1", [
      {
        roomId: "g1",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:viewer-1:peer-a",
        unreadMessageCount: 1,
        latestMessageId: "tip:g1",
        peerUserId: "peer-a",
      },
      {
        roomId: "g2",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:viewer-1:peer-b",
        unreadMessageCount: 2,
        latestMessageId: "tip:g2",
        peerUserId: "peer-b",
      },
      {
        roomId: "gr1",
        chatDomain: "group",
        domainIdentityKey: "group:group-1",
        unreadMessageCount: 1,
        latestMessageId: "tip:gr1",
        groupId: "group-1",
      },
      {
        roomId: "t1",
        chatDomain: "trade",
        domainIdentityKey: "trade:item:seller:buyer",
        unreadMessageCount: 4,
        latestMessageId: "tip:t1",
        listingId: "item",
        sellerId: "seller",
        counterpartyId: "buyer",
      },
      {
        roomId: "t2",
        chatDomain: "trade",
        domainIdentityKey: "trade:item2:seller:buyer",
        unreadMessageCount: 1,
        latestMessageId: "tip:t2",
        listingId: "item2",
        sellerId: "seller",
        counterpartyId: "buyer",
      },
      {
        roomId: "t3",
        chatDomain: "trade",
        domainIdentityKey: "trade:item3:seller:buyer",
        unreadMessageCount: 1,
        latestMessageId: "tip:t3",
        listingId: "item3",
        sellerId: "seller",
        counterpartyId: "buyer",
      },
      {
        roomId: "t4",
        chatDomain: "trade",
        domainIdentityKey: "trade:item4:seller:buyer",
        unreadMessageCount: 1,
        latestMessageId: "tip:t4",
        listingId: "item4",
        sellerId: "seller",
        counterpartyId: "buyer",
      },
      {
        roomId: "o1",
        chatDomain: "store_order_customer",
        domainIdentityKey: "store_order:ord-1",
        unreadMessageCount: 2,
        latestMessageId: "tip:o1",
        orderId: "ord-1",
      },
      {
        roomId: "o2",
        chatDomain: "store_order_customer",
        domainIdentityKey: "store_order:ord-2",
        unreadMessageCount: 1,
        latestMessageId: "tip:o2",
        orderId: "ord-2",
      },
      {
        roomId: "o3",
        chatDomain: "store_order_customer",
        domainIdentityKey: "store_order:ord-3",
        unreadMessageCount: 1,
        latestMessageId: "tip:o3",
        orderId: "ord-3",
      },
    ]);
    const surfaces = projectSurfacesFromConversationAuthority(auth);
    expect(surfaces.bottomChat).toBe(10);
    expect(surfaces.tradeHub).toBe(4);
    expect(surfaces.orderHub).toBe(3);
    expect(surfaces.conversationB).toBe(10);
    expect(auth.totalUnreadRooms).toBe(10);
  });

  it("owner customer isolation: customer hub uses customer row unread only", () => {
    // Customer rows already filtered to buyer participant facts in loader.
    // Owner participant unread must not appear on customer resolver.
    expect(
      resolveStoreOrderListUnreadCount({
        participantUnreadCount: 0,
      })
    ).toBe(0);
    const hub = buildStoreOrderHubViewModel([
      {
        roomId: "r1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
        orderId: "o1",
        storeId: "s1",
        storeName: "S",
        storeImageUrl: null,
        customerUserId: "buyer",
        customerName: "B",
        customerAvatarUrl: null,
        latestChatMessageText: "x",
        latestChatMessageAt: "2026-08-03T00:00:00.000Z",
        latestChatMessageType: "text",
        unreadCount: 2,
        orderStatusLabel: "accepted",
        fulfillmentType: null,
        generation: "test",
      },
      {
        roomId: "r2",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o2",
        orderId: "o2",
        storeId: "s1",
        storeName: "S",
        storeImageUrl: null,
        customerUserId: "buyer",
        customerName: "B",
        customerAvatarUrl: null,
        latestChatMessageText: "y",
        latestChatMessageAt: "2026-08-03T00:00:00.000Z",
        latestChatMessageType: "text",
        unreadCount: 0,
        orderStatusLabel: "accepted",
        fulfillmentType: null,
        generation: "test",
      },
    ]);
    expect(hub.unreadCount).toBe(1);
  });

  it("trade hub equality from rows", () => {
    const rows = [
      {
        roomId: "a",
        chatDomain: "trade" as const,
        domainIdentityKey: "trade:i:a:b",
        itemId: "i",
        sellerUserId: "a",
        counterpartyUserId: "b",
        viewerRole: "buyer" as const,
        itemTitle: "P",
        itemImageUrl: null,
        peerDisplayName: "Peer",
        peerAvatarUrl: null,
        productChatId: null,
        lastMessage: "m",
        lastMessageIsSystem: false,
        lastMessageAt: "2026-08-03T00:00:00.000Z",
        unreadCount: resolveTradeListUnreadCount({ participantUnreadCount: 4 }),
        tradeStatusLabel: null,
        updatedAt: "2026-08-03T00:00:00.000Z",
        generation: "test",
      },
      {
        roomId: "b",
        chatDomain: "trade" as const,
        domainIdentityKey: "trade:i2:a:b",
        itemId: "i2",
        sellerUserId: "a",
        counterpartyUserId: "b",
        viewerRole: "buyer" as const,
        itemTitle: "P2",
        itemImageUrl: null,
        peerDisplayName: "Peer",
        peerAvatarUrl: null,
        productChatId: null,
        lastMessage: "m",
        lastMessageIsSystem: false,
        lastMessageAt: "2026-08-03T00:00:00.000Z",
        unreadCount: resolveTradeListUnreadCount({ participantUnreadCount: 0 }),
        tradeStatusLabel: null,
        updatedAt: "2026-08-03T00:00:00.000Z",
        generation: "test",
      },
      {
        roomId: "c",
        chatDomain: "trade" as const,
        domainIdentityKey: "trade:i3:a:b",
        itemId: "i3",
        sellerUserId: "a",
        counterpartyUserId: "b",
        viewerRole: "buyer" as const,
        itemTitle: "P3",
        itemImageUrl: null,
        peerDisplayName: "Peer",
        peerAvatarUrl: null,
        productChatId: null,
        lastMessage: "m",
        lastMessageIsSystem: false,
        lastMessageAt: "2026-08-03T00:00:00.000Z",
        unreadCount: resolveTradeListUnreadCount({ participantUnreadCount: 2 }),
        tradeStatusLabel: null,
        updatedAt: "2026-08-03T00:00:00.000Z",
        generation: "test",
      },
    ];
    expect(buildTradeHubViewModel(rows).unreadCount).toBe(2);
  });
});
