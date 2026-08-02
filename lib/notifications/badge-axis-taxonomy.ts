/**
 * Badge Authority — A / B / Owner taxonomy (Phase 1 SSOT).
 *
 * Product priority: user-approved contracts > Legacy evidence > code.
 * DO NOT: mix Owner into Member A/B · put chat/missed into Bell A · App Icon ±.
 *
 * Formulas:
 *   A = Member Notification unread (attention units)
 *   B = unread rooms(GD+Group+Trade+Customer) + verified orphan missed
 *   Member App Icon = A + B
 *   Owner* = store_id scoped (never Member A/B/App Icon)
 */

export const BADGE_AXIS_TAXONOMY_VERSION = "badge_axis_taxonomy_v1" as const;

/** A — Member Notification / Bell */
export const MEMBER_NOTIFICATION_A_TYPES = [
  "trade_status",
  "order_status",
  "delivery_status",
  "community_activity",
  "admin_notice",
  "system",
] as const;

/** Explicitly never A (B or Owner or ephemeral). */
export const NEVER_MEMBER_NOTIFICATION_A_TYPES = [
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
  "missed_call",
  "incoming_call",
  "incoming_call_signal",
  "admin_marketing_banner",
  "admin_test",
] as const;

/** B — Member Communication domains contributing unread rooms to App Icon. */
export const MEMBER_COMMUNICATION_B_ROOM_DOMAINS = [
  "general_direct",
  "group",
  "trade",
  "store_order_customer",
] as const;

/** Owner store_id surfaces — never fold into Member App Icon / Bell. */
export const OWNER_ATTENTION_SURFACES = [
  "owner_fab_order_chat",
  "owner_order_attention",
  "owner_operational_notification",
  "owner_admin_menu",
  "owner_customer_chat_hub",
] as const;

export type BadgeAxis = "A_member_notification" | "B_member_communication" | "owner_store";

export type SurfaceUnit = "attention_item" | "unread_message_count" | "unread_room_count" | "owner_attention";

export const SURFACE_UNIT_CONTRACT = {
  bellDigit: { axis: "A_member_notification" as const, unit: "attention_item" as const },
  notificationCenter: { axis: "A_member_notification" as const, unit: "attention_item" as const },
  chatRoomRow: { axis: "B_member_communication" as const, unit: "unread_message_count" as const },
  domainHub: { axis: "B_member_communication" as const, unit: "unread_room_count" as const },
  bottomChat: { axis: "B_member_communication" as const, unit: "unread_room_count" as const },
  memberAppIcon: {
    axis: "A_member_notification+B_member_communication" as const,
    unit: "attention_item+unread_room_count+orphan_missed" as const,
  },
  ownerFab: { axis: "owner_store" as const, unit: "owner_attention" as const },
} as const;

/** Bottom Chat domains — fixed product contract. */
export const BOTTOM_CHAT_UNREAD_ROOM_DOMAINS = ["general_direct", "group"] as const;

export function isNeverMemberNotificationAType(type: string | null | undefined): boolean {
  const t = String(type ?? "").trim();
  return (NEVER_MEMBER_NOTIFICATION_A_TYPES as readonly string[]).includes(t);
}

export function classifyNotificationTypeAxis(type: string | null | undefined): BadgeAxis | "excluded" {
  const t = String(type ?? "").trim();
  if (!t) return "excluded";
  if (isNeverMemberNotificationAType(t)) {
    if (t === "missed_call") return "B_member_communication";
    if (
      t === "chat_message" ||
      t === "group_message" ||
      t === "mention_message" ||
      t === "pin_message" ||
      t === "trade_message" ||
      t === "store_order_message"
    ) {
      return "B_member_communication";
    }
    return "excluded";
  }
  if ((MEMBER_NOTIFICATION_A_TYPES as readonly string[]).includes(t) || t === "admin_notice") {
    return "A_member_notification";
  }
  return "A_member_notification";
}

export function memberAppIconTotal(input: {
  notificationA: number;
  communicationUnreadRooms: number;
  orphanMissedCalls: number;
}): number {
  const a = Math.max(0, Math.floor(Number(input.notificationA) || 0));
  const rooms = Math.max(0, Math.floor(Number(input.communicationUnreadRooms) || 0));
  const missed = Math.max(0, Math.floor(Number(input.orphanMissedCalls) || 0));
  return a + rooms + missed;
}

/** Contract: Owner attention must not enter these member totals. */
export function assertOwnerExcludedFromMemberTotals(input: {
  memberBellTotal: number;
  memberAppIconTotal: number;
  ownerOrderRoomsIncludedInAppIcon: number;
  ownerIntakeIncludedInBell: number;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (input.ownerOrderRoomsIncludedInAppIcon !== 0) {
    errors.push("owner_order_rooms_in_member_app_icon");
  }
  if (input.ownerIntakeIncludedInBell !== 0) {
    errors.push("owner_intake_in_member_bell");
  }
  if (input.memberBellTotal < 0 || input.memberAppIconTotal < 0) {
    errors.push("negative_member_total");
  }
  return { ok: errors.length === 0, errors };
}
