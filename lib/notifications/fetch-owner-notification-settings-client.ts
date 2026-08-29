"use client";

/**
 * Client read of P2-A6 `owner_notification_settings` for Owner sound gate.
 * Missing table (Production apply NOT_PROVEN) → null (no-row compatibility).
 * No settings UI / writes.
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-relation-errors";
import type { OwnerNotificationSettingsStorageRow } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const OWNER_SETTINGS_SELECT =
  "optional_push_enabled, optional_sound_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

const OWNER_SETTINGS_FLIGHT = "owner:notification-settings:get";

export async function fetchOwnerNotificationSettingsRow(
  userId: string
): Promise<OwnerNotificationSettingsStorageRow | null> {
  const uid = userId.trim();
  if (!uid || uid === "me") return null;

  return runSingleFlight(`${OWNER_SETTINGS_FLIGHT}:${uid}`, async () => {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("owner_notification_settings")
      .select(OWNER_SETTINGS_SELECT)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) {
      if (isMissingPreferenceRelationError(error)) return null;
      return null;
    }
    return (data as OwnerNotificationSettingsStorageRow | null) ?? null;
  });
}

export function invalidateOwnerNotificationSettingsFlight(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  forgetSingleFlight(`${OWNER_SETTINGS_FLIGHT}:${uid}`);
}
