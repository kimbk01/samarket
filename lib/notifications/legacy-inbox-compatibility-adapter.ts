/**
 * Legacy `notifications` table compatibility — read-only adapter.
 *
 * Writers must go through `createNotificationEvent` / `appendUserNotification`.
 * Direct INSERT into `notifications` is banned by contract tests.
 *
 * Sunset: re-evaluate after 2026-09-01 once Production shows 0 new legacy rows
 * not mirrored in `notification_events`. Table DROP is a separate migration.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const LEGACY_NOTIFICATIONS_TABLE = "notifications" as const;

export const LEGACY_INBOX_COMPAT_SUNSET = "2026-09-01" as const;

/**
 * Single entry for selecting legacy notification rows for inbox merge.
 * Prefer notification_events; use this only when merging historical rows.
 */
export function legacyNotificationsSelect(svc: SupabaseClient) {
  return svc.from(LEGACY_NOTIFICATIONS_TABLE);
}

export function isLegacyInboxCompatActive(now = new Date()): boolean {
  return now.toISOString().slice(0, 10) < LEGACY_INBOX_COMPAT_SUNSET;
}
