import { describe, expect, it } from "vitest";
import {
  buildNotificationBadgeProjection,
  EMPTY_BELL_BADGE_FACTS,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
} from "@/lib/notifications/build-notification-badge-projection";

/**
 * Slice 2-2/2-3 Formula:
 *   Bell = A_member when provided, else NotificationAttentionTotal (legacy)
 *   Member App Icon (A provided) = A + B rooms (no owner) + unresolved missed
 *   Member App Icon (legacy) = chat rooms (buyer-only SO) + NotificationAttentionTotal
 *   Bottom = GD + Group + Trade + Customer Order rooms
 */

describe("Bell Phase B — notificationAttentionTotal", () => {
  it("Bell = NotificationAttention; rooms do not become Bell digit", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 4, group: 2, trade: 2, store_order: 2 },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 1,
      orphanMissedCall: 1,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 3,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 3, chatMessage: 2, adminNotice: 1 },
    });
    expect(p.bellTotal).toBe(3);
    expect(p.bellChatAttentionCount).toBeGreaterThan(3);
    expect(p.bottomChat).toBe(4 + 2 + 2 + 1);
    // Slice 2-3: owner excluded — rooms 4+2+2+buyer1 + NotificationAttention 3
    expect(p.appIconTotal).toBe(4 + 2 + 2 + 1 + 3);
    expect(p.storeOrderOwnerUnreadRooms).toBe(1);
  });

  it("Bottom Chat includes trade + customer order rooms (owner excluded)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 4, store_order: 11 },
      storeOrderBuyerDeliveryUnread: 5,
      storeOrderOwnerChatUnread: 6,
      orphanMissedCall: 1,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 99,
    });
    expect(p.bottomChat).toBe(2 + 1 + 4 + 5);
    expect(p.bellTotal).toBe(99);
  });

  it("App Icon = chat rooms + NotificationAttention (not Bell event SUM alone)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 4, store_order: 11 },
      storeOrderBuyerDeliveryUnread: 5,
      storeOrderOwnerChatUnread: 6,
      orphanMissedCall: 1,
      nonChatEventAttention: {
        tradeStatus: 9,
        orderStatus: 9,
        deliveryStatus: 9,
        communityActivity: 9,
        adminNotice: 9,
      },
      notificationAttentionTotal: 40,
    });
    // Slice 2-3: messenger 3 + trade 4 + buyer 5 (owner 6 excluded) + notif 40
    expect(p.appIconTotal).toBe(3 + 4 + 5 + 40);
    expect(p.bellTotal).toBe(40);
    expect(p.appIconTotal).not.toBe(p.bellTotal);
    expect(p.storeOrderOwnerUnreadRooms).toBe(6);
  });

  it("legacy unreadApprovedNotificationEvents does not drive Bell digit", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: { ...EMPTY_NON_CHAT_EVENT_ATTENTION, adminNotice: 5 },
      unreadApprovedNotificationEvents: 2,
      notificationAttentionTotal: 2,
    });
    expect(p.bellTotal).toBe(2);
    expect(p.bellNonChatEventCount).toBe(5);
  });

  it("when notificationAttentionTotal omitted, Bell falls back to orphan only", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 9, group: 9, trade: 9, store_order: 9 },
      orphanMissedCall: 9,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 7, chatMessage: 4, missedCall: 3 },
    });
    expect(p.bellTotal).toBe(9);
  });

  it("without notificationAttentionTotal, Bell = orphan (rooms never copied to Bell)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 5, group: 5, trade: 5, store_order: 5 },
      orphanMissedCall: 2,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(2);
    expect(p.bottomChat).toBe(5 + 5 + 5 + 0);
    // Unsplit store_order treated as owner hub; excluded from Member App Icon
    expect(p.appIconTotal).toBe(5 + 5 + 5 + 0 + 2);
    expect(p.storeOrderOwnerUnreadRooms).toBe(5);
  });
});

describe("Bell Domain projection — Hub / Bottom / App Icon (room facts)", () => {
  it("A. General room attention → Bottom+1 GD+1; Bell needs NotificationAttention", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 1,
    });
    expect(p.bellTotal).toBe(1);
    expect(p.bottomChat).toBe(1);
    expect(p.generalDirectUnreadRooms).toBe(1);
  });

  it("B. Group room → Bottom+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 1, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 1,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.groupUnreadRooms).toBe(1);
  });

  it("C. Trade: Bottom+1 Trade Hub+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 1,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.tradeHub).toBe(1);
  });

  it("D. Store order owner: Bottom 0 Order Hub+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 1 },
      storeOrderOwnerChatUnread: 1,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 1,
    });
    expect(p.bottomChat).toBe(0);
    expect(p.storeOrderOwnerUnreadRooms).toBe(1);
    expect(p.storeOrderHub).toBe(1);
  });

  it("E. Multi-domain rooms: Bottom=GD+Group+Trade (+customer if buyer)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 1 },
      storeOrderOwnerChatUnread: 1,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 4,
    });
    expect(p.bellChatAttentionCount).toBe(4);
    expect(p.bellTotal).toBe(4);
    expect(p.bottomChat).toBe(3);
    expect(p.tradeHub).toBe(1);
    expect(p.storeOrderHub).toBe(1);
  });

  it("F. NotificationAttention alone raises Bell; chat rooms 0 → App Icon = Bell", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 1,
        adminNotice: 2,
      },
      notificationAttentionTotal: 3,
    });
    expect(p.bellTotal).toBe(3);
    expect(p.appIconTotal).toBe(3);
  });

  it("G. Room count does not multiply by message count", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 1,
    });
    expect(p.generalDirectUnreadRooms).toBe(1);
    expect(p.bellTotal).toBe(1);
  });

  it("I. Read room: Bottom decreases; Bell only if NotificationAttention decreases", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 5,
    });
    const after = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 4,
    });
    expect(before.bottomChat - after.bottomChat).toBe(1);
    expect(before.bellTotal - after.bellTotal).toBe(1);
    expect(after.tradeHub).toBe(before.tradeHub);
  });

  it("K. App Icon = chat rooms + NotificationAttention (Bell digit ≠ App Icon when rooms > 0)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 1,
      nonChatEventAttention: {
        tradeStatus: 3,
        orderStatus: 2,
        deliveryStatus: 1,
        communityActivity: 4,
        adminNotice: 5,
      },
      notificationAttentionTotal: 17,
    });
    expect(p.bellTotal).toBe(17);
    expect(p.appIconTotal).toBe(1 + 17);
    expect(p.appIconTotal).not.toBe(p.bellTotal);
  });
});
