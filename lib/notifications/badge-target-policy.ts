/**
 * Badge target policy SSOT — unread badge = COUNT(unread targets), never event/message SUM.
 * @see docs/plans badge_target_policy
 */

export const NOTIFICATION_TARGET_TYPES = [
  "chat_room",
  "trade",
  "community_post",
  "buyer_order",
  "owner_order",
  "store_review",
  "store_inquiry",
  "owner_order_chat",
  "rider_dispatch",
  "system",
] as const;

export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

export type NotificationTargetScope = "consumer" | "owner_store" | "rider";

/** Badge surface keys — maps to count_notification_targets(p_surface) */
export type BadgeTargetSurface =
  | "tier1_inbox_bell"
  | "bottom_nav_my"
  | "bottom_nav_chat"
  | "bottom_nav_community"
  | "bottom_nav_delivery"
  | "fab_owner_orders"
  | "fab_owner_store"
  | "fab_owner_order_chat"
  | "owner_commerce_inbox"
  | "all";

/** UnreadCountMode → badge surface (bell / my tab) */
export function unreadCountModeToBadgeSurface(mode: string): BadgeTargetSurface | "all" {
  switch (mode) {
    case "all":
      return "all";
    case "consumer":
    case "consumer_no_chat":
      return "tier1_inbox_bell";
    case "owner_store_commerce":
      return "owner_commerce_inbox";
    case "bottom_nav":
    case "bottom_nav_no_chat":
      return "bottom_nav_my";
    default:
      return "tier1_inbox_bell";
  }
}

export function buildTradeTargetId(postId: string, sellerId: string, buyerId: string): string {
  return `${postId.trim()}:${sellerId.trim()}:${buyerId.trim()}`;
}

export const BADGE_TARGET_POLICY_ID = "badge-target-0001" as const;
