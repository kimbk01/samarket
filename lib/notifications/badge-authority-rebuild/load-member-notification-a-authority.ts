/**
 * Member Bell A — full unread authority load (pagination-independent).
 *
 * DO NOT: use NC page slice / visible rows / client fetched length as A digit.
 * List pagination is display-only; Badge A comes from this path (or badge-count HTTP).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBellExplainUnreadEventRows } from "@/lib/notifications/load-bell-explain-unread-events";
import {
  resolveMemberNotificationAuthorityFromRows,
  type MemberNotificationAAuthority,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";

/** Max unread rows scanned for A. Bridge if a member exceeds this (ops alert). */
export const MEMBER_NOTIFICATION_A_LOAD_LIMIT = 2000;

export async function loadMemberNotificationAAuthority(
  sb: SupabaseClient,
  userId: string
): Promise<MemberNotificationAAuthority> {
  const uid = userId.trim();
  if (!uid) {
    return resolveMemberNotificationAuthorityFromRows([], "");
  }
  const rows = await loadBellExplainUnreadEventRows(sb, uid, {
    limit: MEMBER_NOTIFICATION_A_LOAD_LIMIT,
  });
  return resolveMemberNotificationAuthorityFromRows(rows, uid);
}

export async function loadMemberNotificationAUnreadCount(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const auth = await loadMemberNotificationAAuthority(sb, userId);
  return auth.unreadCount;
}
