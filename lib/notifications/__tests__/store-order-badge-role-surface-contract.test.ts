/**
 * Store-order badge surface role alignment — customer pillar ≠ owner FAB.
 * Unit: unread **room** count (buyer_order / owner_order_chat targets).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNotificationBadgeProjection,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
} from "@/lib/notifications/build-notification-badge-projection";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { resolveFabOwnerOrderChatBadgeCount } from "@/lib/delivery/owner/owner-store-badge-display-policy";
import { OWNER_HUB_BADGE_EMPTY, type OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { resolveStoreOrderListUnreadCount } from "@/lib/messenger/store-order/unread-from-notification-targets";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function hub(partial: Partial<OwnerHubBadgeBreakdown>): OwnerHubBadgeBreakdown {
  return { ...OWNER_HUB_BADGE_EMPTY, ...partial };
}

describe("store-order badge role surface contract", () => {
  it("MessengerPillarSummaryRow delivery uses buyer_order axis, not storeOrderChatUnread", () => {
    const src = read("components/community-messenger/MessengerPillarSummaryRow.tsx");
    expect(src).toContain("buyerOrderAttention");
    expect(src).toContain("peekDomainStoreOrderUnreadRoomCount");
    expect(src).toContain("/community-messenger/delivery-chats");
    // delivery unread branch must not read owner FAB field
    const deliveryUnread = src.slice(src.indexOf("const unread ="));
    expect(deliveryUnread).toContain("buyerOrderAttention");
    expect(deliveryUnread).not.toContain("hub.storeOrderChatUnread");
  });

  it("delivery-chats mounts customer list gate only", () => {
    const src = read("components/community-messenger/MessengerPillarChatsSegment.tsx");
    expect(src).toContain("DomainStoreOrderCustomerListCanaryGate");
    expect(src).not.toMatch(/DomainStoreOrderOwner/);
  });

  it("Projection apply writes owner aggregate and customer separately (no FAB overwrite)", () => {
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).toContain("storeOrderCustomerUnreadRooms");
    expect(bridge).toContain("storeOrderOwnerUnreadRooms");
    expect(bridge).toContain("buyerOrderAttention");
    expect(bridge).toContain("never overwrite store-scoped FAB");
    const builder = read("lib/notifications/build-notification-badge-projection.ts");
    expect(builder).toContain("storeOrderOwnerChatUnread");
    expect(builder).toContain("storeOrderCustomerUnreadRooms");
    expect(builder).toContain("unreadApprovedNotificationEvents");
  });

  it("Customer only: buyer 3 / owner 0 → customer pillar 3, owner FAB field independent", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 3 },
      storeOrderBuyerDeliveryUnread: 3,
      storeOrderOwnerChatUnread: 0,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.storeOrderCustomerUnreadRooms).toBe(3);
    expect(p.storeOrderOwnerUnreadRooms).toBe(0);
    const bd = hub({
      communityMessengerUnread: p.bottomChat,
      buyerOrderAttention: p.storeOrderCustomerUnreadRooms,
      storeOrderChatUnread: 0,
      storeOrderOwnerUnreadRooms: p.storeOrderOwnerUnreadRooms,
    });
    expect(resolveMessengerTabTotalUnreadBadgeCount(bd)).toBe(1);
    expect(resolveFabOwnerOrderChatBadgeCount(bd)).toBe(0);
    expect(bd.buyerOrderAttention).toBe(3);
  });

  it("Owner only: buyer 0 / owner 3 → customer 0; store FAB uses store-scoped field", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 3 },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.storeOrderCustomerUnreadRooms).toBe(0);
    expect(p.storeOrderOwnerUnreadRooms).toBe(3);
    const bd = hub({
      communityMessengerUnread: p.bottomChat,
      buyerOrderAttention: p.storeOrderCustomerUnreadRooms,
      storeOrderChatUnread: 3,
      storeOrderOwnerUnreadRooms: p.storeOrderOwnerUnreadRooms,
    });
    expect(resolveMessengerTabTotalUnreadBadgeCount(bd)).toBe(1);
    expect(resolveFabOwnerOrderChatBadgeCount(bd)).toBe(3);
  });

  it("Customer + Owner dual: never shows combined 5 on either surface", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 5 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.storeOrderCustomerUnreadRooms).toBe(2);
    expect(p.storeOrderOwnerUnreadRooms).toBe(3);
    expect(p.storeOrderCustomerUnreadRooms + p.storeOrderOwnerUnreadRooms).toBe(5);
    expect(p.storeOrderOwnerUnreadRooms).not.toBe(5);
    expect(p.storeOrderCustomerUnreadRooms).not.toBe(5);
    expect(p.appIcon.storeOrder).toBe(5);
  });

  it("owner FAB store-scoped 1 is not overwritten by global owner 3 (1→3→1 guard)", () => {
    const storeScopedFab = 1;
    const globalOwner = 3;
    const afterCustomerRouteProjection = hub({
      storeOrderChatUnread: storeScopedFab,
      storeOrderOwnerUnreadRooms: globalOwner,
      buyerOrderAttention: 2,
      communityMessengerUnread: 0,
    });
    expect(resolveFabOwnerOrderChatBadgeCount(afterCustomerRouteProjection)).toBe(1);
    expect(afterCustomerRouteProjection.storeOrderOwnerUnreadRooms).toBe(3);
    expect(afterCustomerRouteProjection.buyerOrderAttention).toBe(2);
  });

  it("Bottom Chat independent of store_order", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 9, store_order: 9 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.tradeHub).toBe(9);
    expect(p.storeOrderCustomerUnreadRooms).toBe(2);
    expect(p.storeOrderOwnerUnreadRooms).toBe(3);
  });

  it("Customer list unread room count matches buyer_order target presence (unit)", () => {
    const targets = new Set(["order-a", "order-b", "order-c"]);
    const rows = ["order-a", "order-b", "order-c", "order-done"].map((orderId) => ({
      orderId,
      unreadCount: resolveStoreOrderListUnreadCount({
        orderId,
        unreadTargetOrderIds: targets,
      }),
    }));
    const unreadRooms = rows.filter((r) => r.unreadCount > 0).length;
    expect(unreadRooms).toBe(3);
    expect(rows.find((r) => r.orderId === "order-done")?.unreadCount).toBe(0);
  });

  it("Read one customer room: customer count −1, owner and bottom unchanged", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 5 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    const after = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 4 },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    expect(after.storeOrderCustomerUnreadRooms).toBe(before.storeOrderCustomerUnreadRooms - 1);
    expect(after.storeOrderOwnerUnreadRooms).toBe(before.storeOrderOwnerUnreadRooms);
    expect(after.bottomChat).toBe(before.bottomChat);
  });

  it("Read one owner room: owner −1, customer and bottom unchanged", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 5 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    const after = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 4 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 2,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 0,
    });
    expect(after.storeOrderOwnerUnreadRooms).toBe(before.storeOrderOwnerUnreadRooms - 1);
    expect(after.storeOrderCustomerUnreadRooms).toBe(before.storeOrderCustomerUnreadRooms);
    expect(after.bottomChat).toBe(before.bottomChat);
  });
});
