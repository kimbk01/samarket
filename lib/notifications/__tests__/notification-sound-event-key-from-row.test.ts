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
