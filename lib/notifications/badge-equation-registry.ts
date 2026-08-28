/**
 * BADGE EQUATION REGISTRY — product SSOT for digit → list → CTA → read.
 *
 * New event types: register in `notification-event-registry` + A/B classifier.
 * Do not invent per-surface switch statements for the same type.
 *
 * APPROVED PRODUCT CONTRACT (GATE 2 / GATE 3) — HARD LOCK P0-A:
 *   Member Bell A = eligible unread notification_events (room count ≠ message SUM)
 *   Member Chat B = unread ROOM count (GD + private_group + trade + store_order_customer)
 *   Member App Icon = A + B only (Owner/Admin excluded)
 *   Owner store chat = unread store_order_owner rooms WHERE store = ACTIVE_STORE
 *   Admin Q = actionable Action Queue COUNT (business pending — NOT notification unread)
 * DO NOT sum A + B + OwnerC + AdminQ into one digit. DO NOT clear Admin Q on view-only.
 */
import { MEMBER_NOTIFICATION_A_KINDS } from "@/lib/notifications/badge-authority-rebuild/badge-event-classifier";
import {
  NOTIFICATION_EVENT_DEFINITIONS,
  type NotificationEventTypeDefinition,
} from "@/lib/notifications/core/notification-event-registry";

export const BADGE_EQUATIONS = Object.freeze({
  memberBellA: {
    id: "MEMBER_BELL_A",
    formula: "COUNT eligible unread Bell notification_events (dedupe first-win)",
    list: "/notifications?filter=unread",
    read: "server markRead / mark-all A-only ACK → recompute A",
    appIconAxis: "A",
  },
  memberChatB: {
    id: "MEMBER_CHAT_B",
    formula:
      "COUNT unread rooms: general_direct + private_group + trade + store_order_customer",
    list: "/community-messenger?section=chats&inbox=unread",
    read: "room enter + mark_read RPC ACK → that room 0 → recompute B",
    appIconAxis: "B",
    not: "message unread SUM · owner store_order rooms · list-open-as-read",
  },
  memberGeneralGroupRooms: {
    id: "MEMBER_GENERAL_GROUP_ROOMS",
    formula: "COUNT unread general_direct + private_group rooms",
    list: "/community-messenger?section=chats&inbox=unread",
    contributesTo: "MEMBER_CHAT_B",
  },
  memberTradeRooms: {
    id: "MEMBER_TRADE_ROOMS",
    formula: "COUNT unread trade rooms",
    list: "/community-messenger?section=chats&inbox=unread (flat rows)",
    contributesTo: "MEMBER_CHAT_B",
  },
  memberCustomerOrderRooms: {
    id: "MEMBER_CUSTOMER_ORDER_ROOMS",
    formula: "COUNT unread store_order_customer rooms",
    list: "/community-messenger?section=chats&inbox=unread (flat rows)",
    contributesTo: "MEMBER_CHAT_B",
  },
  ownerStoreOrderRooms: {
    id: "OWNER_STORE_ORDER_ROOMS",
    formula: "COUNT unread store_order_owner rooms WHERE store_id = ACTIVE_STORE",
    list: "Owner order-chat / hub for ACTIVE_STORE",
    appIconAxis: "EXCLUDED_FROM_MEMBER_APP_ICON",
  },
  adminActionQueueQ: {
    id: "ADMIN_ACTION_QUEUE_Q",
    formula: "SUM loadAdminActionQueueCounts actionable categories",
    list: "/admin/customer-platform#action-queue",
    read: "approve/reject/acknowledge/close/resolve — not mere open",
    appIconAxis: "EXCLUDED_FROM_MEMBER_APP_ICON",
  },
  memberAppIcon: {
    id: "MEMBER_APP_ICON",
    formula: "A + B",
    zeroInvariant: "A=0 AND B=0 → Icon MUST = 0",
    writers: ["NativeBadgeSync → syncNativeBadgeCount(current A+B)"],
    notWriters: ["FCM send-time badge", "APNS aps.badge", "Android summary independent total"],
  },
} as const);

export const MEMBER_BELL_A_EVENT_TYPES = MEMBER_NOTIFICATION_A_KINDS;

/** Registry types with bellPolicy include that participate in Member A (when unread-eligible). */
export function registryBellIncludeTypes(): string[] {
  return Object.values(NOTIFICATION_EVENT_DEFINITIONS)
    .filter((d: NotificationEventTypeDefinition) => d.bellPolicy === "include")
    .map((d) => d.type);
}

/** Chat-domain types: contribute to B via room projection, not Bell A digit. */
export function registryChatAggregateTypes(): string[] {
  return Object.values(NOTIFICATION_EVENT_DEFINITIONS)
    .filter((d: NotificationEventTypeDefinition) => d.bellPolicy === "aggregate")
    .map((d) => d.type);
}
