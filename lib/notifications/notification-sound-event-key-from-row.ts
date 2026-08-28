/**
 * Notification inbox row / push payload → admin SSOT eventKey (single resolver).
 * Domain-only defaults are last-resort fallbacks — meta.kind wins for commerce/community.
 */
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import {
  eventKeyForNotificationDomain,
  eventKeyForNotificationEventType,
} from "@/lib/notifications/notification-sound-event-map";
import {
  isNotificationDomain,
  type NotificationDomain,
} from "@/lib/notifications/notification-domains";
import { BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";

export type NotificationSoundRowInput = {
  notification_type?: string | null;
  domain?: string | null;
  meta?: unknown;
  ref_id?: string | null;
};

const META_KIND_TO_EVENT_KEY: Readonly<Record<string, string>> = {
  community_comment: "community_comment_received",
  community_like: "community_like_received",
  mention_message: "community_mention_received",
  community_chat: "messenger_direct_message_received",
  group_chat: "messenger_group_message_received",
  community_group_invite: "messenger_group_message_received",
  trade_chat: "trade_chat_message_received",
  trade_offer: "trade_offer_received",
  trade_completed: "trade_completed",
  trade_reserved: "trade_reserved",
  missed_call: "call_missed",
  friend_request: "friend_request_received",
  friend_accepted: "friend_request_accepted",
  store_order_created: "delivery_order_created_owner",
  store_order_accept_reminder_30s: "delivery_order_delayed_owner",
  store_order_accept_reminder_60s: "delivery_order_delayed_owner",
  store_order_payment_completed: "delivery_order_created_owner",
  store_order_buyer_cancelled: "delivery_order_cancelled_owner",
  store_order_sold_out: "delivery_order_sold_out_owner",
  store_review: "delivery_review_received_owner",
  store_inquiry: "delivery_inquiry_received_owner",
  store_order_refund_requested: "delivery_order_created_owner",
  store_order_payment_completed_buyer: "delivery_order_status_changed_user",
  store_order_owner_status: "delivery_order_status_changed_user",
  store_order_payment_failed: "delivery_order_status_changed_user",
  store_order_refund_approved: "delivery_order_status_changed_user",
  store_order_auto_completed: "delivery_order_status_changed_user",
  store_point_low: "settlement_balance_low",
  store_point_charge_approved: "settlement_charge_approved",
  store_point_charge_rejected: "settlement_charge_rejected",
  store_point_charge_on_hold: "settlement_charge_requested",
  user_point_charge_approved: "settlement_charge_approved",
  user_point_charge_rejected: "settlement_charge_rejected",
  user_point_charge_on_hold: "settlement_charge_requested",
  admin_marketing_banner: "admin_notice_received",
  admin_notice: "admin_notice_received",
  admin_report: "admin_report_received",
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metaRecord(row: NotificationSoundRowInput): Record<string, unknown> | null {
  if (!row.meta || typeof row.meta !== "object") return null;
  return row.meta as Record<string, unknown>;
}

function metaKind(row: NotificationSoundRowInput): string {
  return trimText(metaRecord(row)?.kind);
}

function receiverRole(row: NotificationSoundRowInput): string {
  const meta = metaRecord(row);
  return trimText(meta?.receiverRole ?? meta?.recipientRole);
}

function pushKind(row: NotificationSoundRowInput): string {
  const meta = metaRecord(row);
  return trimText(meta?.push_kind ?? meta?.pushKind);
}

function isNotificationEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

function eventKeyFromPushKind(pushKindValue: string): string | null {
  switch (pushKindValue) {
    case "marketing":
      return "admin_notice_received";
    case "notice":
    case "system":
      return "admin_notice_received";
    case "delivery":
      return "delivery_order_status_changed_user";
    case "trade":
      return "trade_offer_received";
    case "chat":
      return "messenger_direct_message_received";
    default:
      return null;
  }
}

function eventKeyFromNotificationType(notificationType: string): string | null {
  switch (notificationType) {
    case "marketing":
      return "admin_notice_received";
    case "notice":
    case "system":
      return "admin_notice_received";
    case "admin_test":
      return "admin_notice_received";
    default:
      return null;
  }
}

/**
 * Resolves admin SSOT eventKey from a notification row or push-side payload shape.
 * Returns `null` when no confident mapping exists (caller may use domain fallback).
 */
export function resolveNotificationSoundEventKeyFromRow(
  row: NotificationSoundRowInput
): string | null {
  const kind = metaKind(row);
  if (kind) {
    const fromMeta = META_KIND_TO_EVENT_KEY[kind];
    if (fromMeta) return fromMeta;
    if (kind === "store_order_message") {
      const role = receiverRole(row);
      if (role === "owner") return "delivery_chat_message_received_owner";
      if (role === "user" || role === "member") return "delivery_chat_message_received_user";
    }
    if (isNotificationEventType(kind)) {
      return eventKeyForNotificationEventType(kind);
    }
  }

  const pk = pushKind(row);
  if (pk === "community") {
    if (kind === "community_like") return "community_like_received";
    if (kind === "community_comment") return "community_comment_received";
    if (kind === "mention_message") return "community_mention_received";
    if (kind) return "community_comment_received";
  }
  const fromPushKind = pk ? eventKeyFromPushKind(pk) : null;
  if (fromPushKind) return fromPushKind;

  const notificationType = trimText(row.notification_type);
  if (notificationType === "commerce" && kind) {
    if (OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) {
      return "delivery_order_created_owner";
    }
    if (BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) {
      return "delivery_order_status_changed_user";
    }
  }

  const fromNotificationType = notificationType ? eventKeyFromNotificationType(notificationType) : null;
  if (fromNotificationType) return fromNotificationType;

  const domain = trimText(row.domain);
  if (domain && isNotificationDomain(domain)) {
    if (domain === "community_chat") {
      if (kind === "group_chat" || kind === "community_group_invite") {
        return "messenger_group_message_received";
      }
      if (kind === "community_comment") return "community_comment_received";
      if (kind === "community_like") return "community_like_received";
      if (kind === "mention_message") return "community_mention_received";
      if (kind && kind !== "community_chat") {
        const mapped = META_KIND_TO_EVENT_KEY[kind];
        if (mapped) return mapped;
      }
    }
    return eventKeyForNotificationDomain(domain as NotificationDomain);
  }

  return null;
}

/** eventKey resolve with domain → system_default fallback chain for playback / push enrichment. */
export function resolveNotificationSoundEventKeyFromRowWithFallback(
  row: NotificationSoundRowInput
): string {
  const direct = resolveNotificationSoundEventKeyFromRow(row);
  if (direct) return direct;

  const domain = trimText(row.domain);
  if (domain && isNotificationDomain(domain)) {
    return eventKeyForNotificationDomain(domain as NotificationDomain);
  }

  return "system_default";
}

/** Gate checks (settings / active room) — domain family only; sound uses eventKey. */
export function resolveNotificationSoundGateDomainFromRow(
  row: NotificationSoundRowInput
): NotificationDomain | null {
  const kind = metaKind(row);
  if (kind === "community_comment" || kind === "community_like" || kind === "mention_message") {
    return "community_chat";
  }
  if (kind === "group_chat" || kind === "community_group_invite") {
    return "community_group_chat";
  }
  if (kind === "trade_chat") return "trade_chat";
  if (kind === "community_chat") return "community_direct_chat";

  const domain = trimText(row.domain);
  if (domain && isNotificationDomain(domain)) {
    if (domain === "community_chat") return "community_direct_chat";
    return domain as NotificationDomain;
  }

  if (row.notification_type === "chat") {
    if (kind === "trade_chat") return "trade_chat";
    if (kind === "community_chat") return "community_direct_chat";
    if (kind === "group_chat") return "community_group_chat";
  }

  if (row.notification_type === "commerce" && kind) {
    if (OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) return "store";
    if (BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) return "order";
    if (kind.startsWith("store_point") || kind.startsWith("user_point")) return "store";
  }

  return null;
}
