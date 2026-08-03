/**
 * Segmented unread count server reader.
 *
 * Gate 3 Step 13 — DELETE legacy `public.notifications` COUNT fallback.
 * RPC miss / error must NOT invent digits from the legacy table.
 *
 * Product Badge Authority (A/B/C/App Icon/NC/Push) does not use this path:
 * - Member A + App Icon → `/api/me/notifications/badge-count` (domain authority)
 * - Tier1 surface unread → `badge_surface` → notification_targets
 * - Owner commerce unread → owner dashboard notifications snapshot
 *
 * Remaining callers: measure / compat `unread_count_only` without badge_surface.
 * Those require `count_notification_unread_segmented` RPC — no silent fallback.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeTargetSurface } from "@/lib/notifications/badge-target-policy";
import { countNotificationTargets } from "@/lib/notifications/notification-targets";
import type { UnreadCountMode } from "@/lib/notifications/notification-unread-count-cache";

export const NOTIFICATION_UNREAD_SEGMENTED_RPC = "count_notification_unread_segmented";

export const SEGMENTED_UNREAD_LEGACY_FALLBACK_DELETED =
  "gate3_step13_segmented_legacy_fallback_deleted" as const;

/**
 * Tier1 종 surface — notification_targets only (legacy notifications COUNT fallback 없음).
 */
export async function countNotificationTargetsSurfaceServer(
  sb: SupabaseClient<any>,
  userId: string,
  surface: BadgeTargetSurface,
  storeId?: string | null
): Promise<number> {
  return countNotificationTargets(sb, userId, surface, storeId);
}

/** 단일 RPC — cold 1 RTT. Legacy notifications COUNT fallback removed (Step 13). */
export async function countNotificationUnreadSegmentedServer(
  sb: SupabaseClient<any>,
  userId: string,
  mode: UnreadCountMode
): Promise<number> {
  const { data, error } = await sb.rpc(NOTIFICATION_UNREAD_SEGMENTED_RPC, {
    p_user_id: userId,
    p_segment: mode,
  });
  if (error) {
    throw error;
  }
  return Math.max(0, Math.floor(Number(data) || 0));
}
