"use client";

/**
 * Client read of P2-A6 `admin_notification_preferences` for Admin Ops sound.
 * Missing table (Production apply NOT_PROVEN) → null (no-row compatibility).
 * Distinct from global Admin sound asset/config table (not used as mute).
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-relation-errors";
import type { AdminNotificationPreferenceStorageRow } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const ADMIN_OPS_PREF_SELECT = "sound_enabled";
const ADMIN_OPS_PREF_FLIGHT = "admin:notification-preferences:get";

export async function fetchAdminNotificationPreferencesRow(
  userId: string
): Promise<AdminNotificationPreferenceStorageRow | null> {
  const uid = userId.trim();
  if (!uid || uid === "me") return null;

  return runSingleFlight(`${ADMIN_OPS_PREF_FLIGHT}:${uid}`, async () => {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("admin_notification_preferences")
      .select(ADMIN_OPS_PREF_SELECT)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) {
      if (isMissingPreferenceRelationError(error)) return null;
      return null;
    }
    return (data as AdminNotificationPreferenceStorageRow | null) ?? null;
  });
}

export function invalidateAdminNotificationPreferencesFlight(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  forgetSingleFlight(`${ADMIN_OPS_PREF_FLIGHT}:${uid}`);
}
