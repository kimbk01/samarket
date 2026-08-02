import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BADGE_AXIS_TAXONOMY_VERSION,
  BOTTOM_CHAT_UNREAD_ROOM_DOMAINS,
  MEMBER_COMMUNICATION_B_ROOM_DOMAINS,
  assertOwnerExcludedFromMemberTotals,
  classifyNotificationTypeAxis,
  isNeverMemberNotificationAType,
  memberAppIconTotal,
} from "@/lib/notifications/badge-axis-taxonomy";
import {
  buildUnifiedAppIconProjection,
  CHAT_MESSAGE_NOTIFICATION_TYPES,
} from "@/lib/notifications/chat-notification-attention-projection";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

describe("badge-axis-taxonomy Phase 1 contract", () => {
  it("exports taxonomy version and B room domains including customer, not owner", () => {
    expect(BADGE_AXIS_TAXONOMY_VERSION).toBe("badge_axis_taxonomy_v1");
    expect(MEMBER_COMMUNICATION_B_ROOM_DOMAINS).toEqual([
      "general_direct",
      "group",
      "trade",
      "store_order_customer",
    ]);
    expect(BOTTOM_CHAT_UNREAD_ROOM_DOMAINS).toEqual(["general_direct", "group"]);
  });

  it("chat and missed never classify as A", () => {
    expect(isNeverMemberNotificationAType("chat_message")).toBe(true);
    expect(isNeverMemberNotificationAType("missed_call")).toBe(true);
    expect(classifyNotificationTypeAxis("chat_message")).toBe("B_member_communication");
    expect(classifyNotificationTypeAxis("missed_call")).toBe("B_member_communication");
    expect(classifyNotificationTypeAxis("trade_status")).toBe("A_member_notification");
  });

  it("memberAppIconTotal = A + rooms + orphan; owner rooms not in formula", () => {
    expect(memberAppIconTotal({ notificationA: 2, communicationUnreadRooms: 4, orphanMissedCalls: 1 })).toBe(
      7
    );
    const unified = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: ["g1"],
        groupRoomIds: [],
        tradeRoomIds: ["t1"],
        customerOrderRoomIds: ["c1"],
        ownerOrderRoomIds: ["o1", "o2"],
      },
      notificationEvents: [
        {
          id: "a1",
          type: "trade_status",
          unread: true,
          read_at: null,
          display_payload: { product_id: "p1", legacyMeta: { product_id: "p1" } },
        },
        {
          id: "m1",
          type: "missed_call",
          category: "missed_call",
          room_id: null,
          unread: true,
          read_at: null,
          dedupe_key: "missed:1",
          display_payload: {},
        },
      ],
    });
    expect(unified.memberNotificationTotal).toBe(1);
    expect(unified.chat.memberAppIconRoomCount).toBe(3);
    expect(unified.missedCallCount).toBe(1);
    expect(unified.appIconTotal).toBe(5);
    expect(
      assertOwnerExcludedFromMemberTotals({
        memberBellTotal: unified.memberNotificationTotal,
        memberAppIconTotal: unified.appIconTotal,
        ownerOrderRoomsIncludedInAppIcon: 0,
        ownerIntakeIncludedInBell: 0,
      }).ok
    ).toBe(true);
  });

  it("Builder Bell ignores orphan; Bottom stays GD+Group", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 4, store_order: 9 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 7,
      orphanMissedCall: 3,
      memberMissedCallCount: 3,
      notificationAttentionTotal: 5,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
    });
    expect(p.bellTotal).toBe(5);
    expect(p.bottomChat).toBe(3);
    expect(p.appIcon.storeOrder).toBe(2);
    expect(p.appIconTotal).toBe(2 + 1 + 4 + 2 + 5 + 3);
  });

  it("CHAT_MESSAGE types stay aligned with NEVER_A set", () => {
    for (const t of CHAT_MESSAGE_NOTIFICATION_TYPES) {
      expect(isNeverMemberNotificationAType(t)).toBe(true);
    }
  });

  it("import ban: taxonomy must not invent Store Projection module", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/badge-axis-taxonomy.ts"), "utf8");
    expect(src).not.toContain("storeOperational");
    expect(src).not.toContain("member-store-attention");
  });
});
