import { describe, expect, it } from "vitest";
import {
  resolveNotificationSoundEventKeyFromRow,
  resolveNotificationSoundEventKeyFromRowWithFallback,
  resolveNotificationSoundGateDomainFromRow,
} from "@/lib/notifications/notification-sound-event-key-from-row";

describe("notification-sound-event-key-from-row", () => {
  it("maps community social meta.kind to community SSOT keys (not messenger direct)", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "report",
        domain: "community_chat",
        meta: { kind: "community_comment", push_kind: "community" },
      })
    ).toBe("community_comment_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "report",
        domain: "community_chat",
        meta: { kind: "community_like", push_kind: "community" },
      })
    ).toBe("community_like_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "mention_message", room_id: "room-1" },
      })
    ).toBe("community_mention_received");
  });

  it("does not route community like/comment through messenger direct", () => {
    const commentKey = resolveNotificationSoundEventKeyFromRow({
      domain: "community_chat",
      meta: { kind: "community_comment" },
    });
    const likeKey = resolveNotificationSoundEventKeyFromRow({
      domain: "community_chat",
      meta: { kind: "community_like" },
    });
    expect(commentKey).not.toBe("messenger_direct_message_received");
    expect(likeKey).not.toBe("messenger_direct_message_received");
  });

  it("maps messenger chat kinds", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "community_chat", room_id: "r1" },
      })
    ).toBe("messenger_direct_message_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "group_chat", room_id: "r1" },
      })
    ).toBe("messenger_group_message_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "trade_chat", room_id: "r1" },
      })
    ).toBe("trade_chat_message_received");
  });

  it("maps store order message receiver roles to owner/user delivery chat sounds", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "store_order_message", receiverRole: "owner", room_id: "r1" },
      })
    ).toBe("delivery_chat_message_received_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "store_order_message", receiverRole: "user", room_id: "r1" },
      })
    ).toBe("delivery_chat_message_received_user");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "store_order_message", receiverRole: "member", room_id: "r1" },
      })
    ).toBe("delivery_chat_message_received_user");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        meta: { kind: "store_order_message", room_id: "r1" },
      })
    ).toBe("delivery_chat_message_received_user");
  });

  it("maps delivery owner new order separately from owner chat domain default", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_created", order_id: "o1" },
      })
    ).toBe("delivery_order_created_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_created", order_id: "o1" },
      })
    ).not.toBe("delivery_chat_message_received_owner");
  });

  it("maps delivery user order status", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "order",
        meta: { kind: "store_order_owner_status", order_id: "o1" },
      })
    ).toBe("delivery_order_status_changed_user");
  });

  it("maps settlement balance/charge separately from delivery chat", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_point_low", store_id: "s1" },
      })
    ).toBe("settlement_balance_low");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_point_charge_approved", store_id: "s1" },
      })
    ).toBe("settlement_charge_approved");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_point_charge_rejected", store_id: "s1" },
      })
    ).toBe("settlement_charge_rejected");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        meta: { kind: "store_point_low" },
      })
    ).not.toBe("delivery_chat_message_received_owner");
  });

  it("maps friend_accepted to friend_request_accepted (not messenger direct)", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "system",
        domain: "community_chat",
        meta: { kind: "friend_accepted", request_id: "req-1" },
      })
    ).toBe("friend_request_accepted");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "system",
        domain: "community_chat",
        meta: { kind: "friend_accepted", request_id: "req-1" },
      })
    ).not.toBe("messenger_direct_message_received");
  });

  it("maps owner accept reminders to delivery_order_delayed_owner", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_accept_reminder_30s", order_id: "o1" },
      })
    ).toBe("delivery_order_delayed_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_accept_reminder_60s", order_id: "o1" },
      })
    ).toBe("delivery_order_delayed_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_accept_reminder_30s", order_id: "o1" },
      })
    ).not.toBe("delivery_order_created_owner");
  });

  it("keeps a7f38fc5 resolver mappings (regression)", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "chat",
        domain: "trade_chat",
        meta: { kind: "trade_chat", room_id: "r1" },
      })
    ).toBe("trade_chat_message_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "status",
        meta: { kind: "trade_offer" },
      })
    ).toBe("trade_offer_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "status",
        domain: "trade_chat",
        meta: { kind: "trade_completed" },
      })
    ).toBe("trade_completed");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "status",
        domain: "trade_chat",
        meta: { kind: "trade_reserved" },
      })
    ).toBe("trade_reserved");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_buyer_cancelled", order_id: "o1" },
      })
    ).toBe("delivery_order_cancelled_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "system",
        meta: { kind: "missed_call" },
      })
    ).toBe("call_missed");
  });

  it("maps Phase 3 owner store meta.kind to delivery SSOT keys (not owner chat default)", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_sold_out", order_id: "o1", product_id: "p1" },
      })
    ).toBe("delivery_order_sold_out_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_review", review_id: "rv-1", order_id: "o1" },
      })
    ).toBe("delivery_review_received_owner");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_inquiry", inquiry_id: "inq-1" },
      })
    ).toBe("delivery_inquiry_received_owner");

    for (const kind of ["store_order_sold_out", "store_review", "store_inquiry"] as const) {
      expect(
        resolveNotificationSoundEventKeyFromRow({
          notification_type: "commerce",
          domain: "store",
          meta: { kind },
        })
      ).not.toBe("delivery_chat_message_received_owner");
    }

    expect(
      resolveNotificationSoundGateDomainFromRow({
        notification_type: "commerce",
        domain: "store",
        meta: { kind: "store_order_sold_out", order_id: "o1", product_id: "p1" },
      })
    ).toBe("store");
  });

  it("maps admin notice and report", () => {
    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "system",
        meta: { kind: "admin_notice" },
      })
    ).toBe("admin_notice_received");

    expect(
      resolveNotificationSoundEventKeyFromRow({
        notification_type: "report",
        meta: { kind: "admin_report" },
      })
    ).toBe("admin_report_received");
  });

  it("uses domain fallback only when meta.kind is absent", () => {
    expect(
      resolveNotificationSoundEventKeyFromRowWithFallback({
        domain: "trade_chat",
      })
    ).toBe("trade_chat_message_received");

    expect(
      resolveNotificationSoundEventKeyFromRowWithFallback({
        domain: "store",
      })
    ).toBe("delivery_chat_message_received_owner");
  });

  it("resolves gate domain for community social rows", () => {
    expect(
      resolveNotificationSoundGateDomainFromRow({
        domain: "community_chat",
        meta: { kind: "community_like" },
      })
    ).toBe("community_chat");
  });
});
