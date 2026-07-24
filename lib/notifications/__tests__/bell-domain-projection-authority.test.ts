import { describe, expect, it } from "vitest";
import {
  buildNotificationBadgeProjection,
  EMPTY_BELL_BADGE_FACTS,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
} from "@/lib/notifications/build-notification-badge-projection";

describe("Bell Contract B — unreadApprovedNotificationEvents", () => {
  it("Bell = approved events only; room unread 10 + events 3 → Bell 3", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 4, group: 2, trade: 2, store_order: 2 },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 1,
      orphanMissedCall: 1,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 3,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 3, chatMessage: 2, adminNotice: 1 },
    });
    expect(p.bellTotal).toBe(3);
    expect(p.bellChatAttentionCount).toBeGreaterThan(3);
    expect(p.bottomChat).toBe(6);
    expect(p.appIconTotal).toBe(4 + 2 + 2 + 1 + 1 + 1);
  });

  it("Bottom Chat ignores trade/order/orphan", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 4, store_order: 11 },
      storeOrderBuyerDeliveryUnread: 5,
      storeOrderOwnerChatUnread: 6,
      orphanMissedCall: 1,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 99,
    });
    expect(p.bottomChat).toBe(3);
    expect(p.bellTotal).toBe(99);
  });

  it("App Icon = GD+group+trade+customer+owner+orphan", () => {
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
      unreadApprovedNotificationEvents: 40,
    });
    expect(p.appIconTotal).toBe(19);
    expect(p.bellTotal).toBe(40);
    expect(p.appIconTotal).not.toBe(p.bellTotal);
  });

  it("does not use deprecated room-sum formula when events provided", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: { ...EMPTY_NON_CHAT_EVENT_ATTENTION, adminNotice: 5 },
      unreadApprovedNotificationEvents: 2,
    });
    expect(p.bellTotal).toBe(2);
    expect(p.bellNonChatEventCount).toBe(5);
  });

  it("falls back to bell.total when unreadApprovedNotificationEvents omitted", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 9, group: 9, trade: 9, store_order: 9 },
      orphanMissedCall: 9,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 7, chatMessage: 4, missedCall: 3 },
    });
    expect(p.bellTotal).toBe(7);
  });

  it("without event facts Bell stays 0 (does not copy room attention)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 5, group: 5, trade: 5, store_order: 5 },
      orphanMissedCall: 2,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(0);
    expect(p.bottomChat).toBe(10);
    expect(p.appIconTotal).toBeGreaterThan(0);
  });
});

describe("Bell Domain projection — Hub / Bottom / App Icon (room facts)", () => {
  it("A. General room attention → Bottom+1 GD+1; Bell needs events", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 1,
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
      unreadApprovedNotificationEvents: 1,
    });
    expect(p.bottomChat).toBe(1);
    expect(p.groupUnreadRooms).toBe(1);
  });

  it("C. Trade: Bottom unchanged Trade Hub+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 1,
    });
    expect(p.bottomChat).toBe(0);
    expect(p.tradeHub).toBe(1);
  });

  it("D. Store order owner: Bottom 0 Order Hub+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 1 },
      storeOrderOwnerChatUnread: 1,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 1,
    });
    expect(p.bottomChat).toBe(0);
    expect(p.storeOrderOwnerUnreadRooms).toBe(1);
    expect(p.storeOrderHub).toBe(1);
  });

  it("E. Multi-domain rooms: Bottom=2 hubs=1 each", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 1 },
      storeOrderOwnerChatUnread: 1,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 4,
    });
    expect(p.bellChatAttentionCount).toBe(4);
    expect(p.bellTotal).toBe(4);
    expect(p.bottomChat).toBe(2);
    expect(p.tradeHub).toBe(1);
    expect(p.storeOrderHub).toBe(1);
  });

  it("F. Non-chat events alone do not raise Bell unless counted in unreadApproved", () => {
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
      unreadApprovedNotificationEvents: 3,
    });
    expect(p.bellTotal).toBe(3);
    expect(p.appIconTotal).toBe(0);
  });

  it("G. Room count does not multiply by message count", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 1,
    });
    expect(p.generalDirectUnreadRooms).toBe(1);
    expect(p.bellTotal).toBe(1);
  });

  it("I. Read room: Bottom decreases; Bell only if events decrease", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 5,
    });
    const after = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      unreadApprovedNotificationEvents: 4,
    });
    expect(before.bottomChat - after.bottomChat).toBe(1);
    expect(before.bellTotal - after.bellTotal).toBe(1);
    expect(after.tradeHub).toBe(before.tradeHub);
  });

  it("K. App Icon excludes non-chat status from icon total", () => {
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
      unreadApprovedNotificationEvents: 17,
    });
    expect(p.bellTotal).toBe(17);
    expect(p.appIconTotal).toBe(2);
    expect(p.appIconTotal).not.toBe(p.bellTotal);
  });
});
