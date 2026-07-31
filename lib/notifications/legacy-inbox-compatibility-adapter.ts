/**
 * Legacy `notifications` table compatibility — read-only adapter.
 *
 * Writers must go through `createNotificationEvent` / `appendUserNotification`.
 * Direct INSERT into `notifications` is banned by contract tests.
 *
 * Table DROP is a separate approved migration (Phase 4 Batch B+).
 * `isLegacyInboxCompatActive` removed Phase 4-2 Batch A (caller/runtime 0).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const LEGACY_NOTIFICATIONS_TABLE = "notifications" as const;

/**
 * Single entry for selecting legacy notification rows for inbox merge.
 * Prefer notification_events; use this only when merging historical rows.
 */
export function legacyNotificationsSelect(svc: SupabaseClient) {
  return svc.from(LEGACY_NOTIFICATIONS_TABLE);
}
