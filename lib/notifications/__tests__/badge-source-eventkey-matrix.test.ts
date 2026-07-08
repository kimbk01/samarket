import { describe, expect, it } from "vitest";
import { eventKeyForNotificationEventType } from "@/lib/notifications/notification-sound-event-map";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";

/**
 * Rebuild: badge surface source (event type / category) must map to a sound eventKey.
 * Does not modify registry — consumes public map API only.
 */
const MATRIX: Array<{
  type: NotificationEventType;
  badgeSurface: "chat" | "trade" | "delivery" | "community" | "system";
  eventKey: string;
}> = [
  {
    type: "chat_message",
    badgeSurface: "chat",
    eventKey: "messenger_direct_message_received",
  },
  {
    type: "group_message",
    badgeSurface: "chat",
    eventKey: "messenger_group_message_received",
  },
  {
    type: "trade_message",
    badgeSurface: "trade",
    eventKey: "trade_chat_message_received",
  },
  {
    type: "trade_status",
    badgeSurface: "trade",
    eventKey: "trade_offer_received",
  },
  {
    type: "order_status",
    badgeSurface: "delivery",
    eventKey: "delivery_order_status_changed_user",
  },
  {
    type: "delivery_status",
    badgeSurface: "delivery",
    eventKey: "delivery_order_status_changed_user",
  },
  {
    type: "store_order_message",
    badgeSurface: "delivery",
    eventKey: "delivery_chat_message_received_user",
  },
  {
    type: "community_activity",
    badgeSurface: "community",
    eventKey: "community_comment_received",
  },
];

describe("badge source ↔ sound eventKey matrix", () => {
  it.each(MATRIX)(
    "$type → badge=$badgeSurface sound=$eventKey",
    ({ type, eventKey }) => {
      const key = eventKeyForNotificationEventType(type);
      expect(key).toBe(eventKey);
      expect(key).not.toBe("");
      // FAIL if badge-capable type collapses to empty/unknown without system_default intentional
      expect(key === "system_default" && type !== ("unknown" as NotificationEventType)).toBe(false);
    }
  );

  it("trade types do not resolve to messenger_direct (Chat) eventKey", () => {
    expect(eventKeyForNotificationEventType("trade_message")).not.toBe(
      "messenger_direct_message_received"
    );
    expect(eventKeyForNotificationEventType("trade_status")).not.toBe(
      "messenger_direct_message_received"
    );
  });

  it("chat types do not resolve to trade_chat eventKey", () => {
    expect(eventKeyForNotificationEventType("chat_message")).not.toBe("trade_chat_message_received");
    expect(eventKeyForNotificationEventType("group_message")).not.toBe("trade_chat_message_received");
  });
});
