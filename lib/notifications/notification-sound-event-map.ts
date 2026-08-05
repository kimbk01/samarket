/**
 * Legacy NotificationDomain / NotificationEventType → SSOT eventKey.
 */
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";

const DOMAIN_TO_PRIMARY_EVENT: Record<NotificationDomain, string> = {
  trade_chat: "trade_chat_message_received",
  community_direct_chat: "messenger_direct_message_received",
  community_group_chat: "messenger_group_message_received",
  community_chat: "messenger_direct_message_received",
  order: "delivery_order_status_changed_user",
  store: "delivery_chat_message_received_owner",
};

const EVENT_TYPE_TO_KEY: Partial<Record<NotificationEventType, string>> = {
  chat_message: "messenger_direct_message_received",
  group_message: "messenger_group_message_received",
  mention_message: "community_mention_received",
  pin_message: "messenger_group_message_received",
  trade_message: "trade_chat_message_received",
  store_order_message: "delivery_chat_message_received_user",
  trade_status: "trade_offer_received",
  order_status: "delivery_order_status_changed_user",
  delivery_status: "delivery_order_status_changed_user",
  community_activity: "community_comment_received",
  admin_marketing_banner: "admin_notice_received",
  admin_notice: "admin_notice_received",
  inquiry_answered: "admin_notice_received",
  inbox_message_received: "admin_notice_received",
  missed_call: "call_missed",
  incoming_call_signal: "call_incoming_voice",
};

export function eventKeyForNotificationDomain(domain: NotificationDomain): string {
  return DOMAIN_TO_PRIMARY_EVENT[domain] ?? "system_default";
}

export function eventKeyForNotificationEventType(type: NotificationEventType): string {
  return EVENT_TYPE_TO_KEY[type] ?? "system_default";
}

export function eventKeyForCallKind(kind: "voice" | "video", mode: "incoming" | "outgoing"): string {
  if (mode === "incoming") {
    return kind === "video" ? "call_incoming_video" : "call_incoming_voice";
  }
  return kind === "video" ? "call_outgoing_video" : "call_outgoing_voice";
}

/** Legacy admin_notification_settings.type → primary eventKey */
export function eventKeysForLegacyAdminDomainType(type: string): string[] {
  switch (type) {
    case "community_direct_chat":
      return ["messenger_direct_message_received", "friend_request_received", "friend_request_accepted"];
    case "community_group_chat":
      return ["messenger_group_message_received"];
    case "trade_chat":
      return [
        "trade_chat_message_received",
        "trade_offer_received",
        "trade_reserved",
        "trade_completed",
      ];
    case "order":
      return ["delivery_order_status_changed_user"];
    case "store":
      return [
        "delivery_chat_message_received_owner",
        "delivery_chat_message_received_user",
        "settlement_balance_low",
        "settlement_charge_approved",
        "settlement_charge_rejected",
      ];
    default:
      return [];
  }
}
