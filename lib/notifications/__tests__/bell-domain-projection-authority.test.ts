import { describe, expect, it } from "vitest";
import {
  buildNotificationBadgeProjection,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
} from "@/lib/notifications/build-notification-badge-projection";

describe("Bell Domain projection authority (A–L)", () => {
  it("A. General: 5 messages same room → Bell+1 Bottom+1 GD+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(1);
    expect(p.bottomChat).toBe(1);
    expect(p.generalDirectUnreadRooms).toBe(1);
    expect(p.bell.chatMessage).toBe(1);
  });

  it("B. Group: same", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 1, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(1);
    expect(p.bottomChat).toBe(1);
    expect(p.groupUnreadRooms).toBe(1);
  });

  it("C. Trade: Bell+1 Bottom unchanged Trade Hub+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(1);
    expect(p.bottomChat).toBe(0);
    expect(p.tradeHub).toBe(1);
  });

  it("D. Store order: Bell+1 Bottom 0 Order Hub+1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 1 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(1);
    expect(p.bottomChat).toBe(0);
    expect(p.storeOrderHub).toBe(1);
  });

  it("E. Multi-domain: Bell chat=4 Bottom=2 each hub=1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 1 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellChatAttentionCount).toBe(4);
    expect(p.bellTotal).toBe(4);
    expect(p.bottomChat).toBe(2);
    expect(p.tradeHub).toBe(1);
    expect(p.storeOrderHub).toBe(1);
  });

  it("F. Non-chat: admin+community increase Bell only", () => {
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
    });
    expect(p.bellTotal).toBe(3);
    expect(p.bottomChat).toBe(0);
    expect(p.tradeHub).toBe(0);
    expect(p.storeOrderHub).toBe(0);
    expect(p.appIconTotal).toBe(0);
  });

  it("G. Duplicate events: room count does not multiply by message count", () => {
    // Input is already room attention (1), not 5 message events
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bellTotal).toBe(1);
  });

  it("I. Read: room clear reduces Bell and Bottom only for GD", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    const after = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(before.bellTotal - after.bellTotal).toBe(1);
    expect(before.bottomChat - after.bottomChat).toBe(1);
    expect(after.tradeHub).toBe(before.tradeHub);
  });

  it("J. Admin read: non-chat only decreases", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: {
        ...EMPTY_NON_CHAT_EVENT_ATTENTION,
        adminNotice: 2,
      },
    });
    const after = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(before.bellTotal - after.bellTotal).toBe(2);
    expect(after.generalDirectUnreadRooms).toBe(1);
    expect(after.bottomChat).toBe(1);
  });

  it("K. App Icon excludes non-chat admin/status from Bell", () => {
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
    });
    expect(p.bellTotal).toBe(1 + 1 + 3 + 2 + 1 + 4 + 5);
    expect(p.appIconTotal).toBe(1 + 1); // messenger GD + orphan only
    expect(p.appIconTotal).not.toBe(p.bellTotal);
  });

  it("does not double-count chat events via bell.total from events SUM input", () => {
    // Builder ignores deprecated `bell` raw events for product total
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      bell: {
        total: 99,
        chatMessage: 50,
        groupMessage: 0,
        tradeMessage: 0,
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminMarketingBanner: 0,
        adminNotice: 0,
        chat: 50,
        group: 0,
        trade: 0,
        store: 0,
        missedCall: 0,
      },
    });
    expect(p.bellTotal).toBe(1);
  });
});
