/**
 * P2-A4/P2-A6 — Server-side notification preference READ authority.
 *
 * Fetches current storage rows and delegates to the pure normalizer.
 * Does not resolve event policy or mutate storage.
 * Does not cut over Owner/Admin runtime consumers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  type AdminNotificationPreferenceStorageRow,
  type LegacyUserSettingsPushRow,
  type NotificationSettingsStorageRow,
  type OwnerNotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

const NOTIFICATION_SETTINGS_SELECT =
  "service_enabled, trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled, trade_events_enabled, community_social_enabled, notice_enabled, marketing_enabled, sound_enabled, vibration_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

const LEGACY_USER_SETTINGS_PUSH_SELECT =
  "push_enabled, chat_push_enabled, marketing_push_enabled, do_not_disturb_enabled, do_not_disturb_start, do_not_disturb_end";

const OWNER_SETTINGS_SELECT =
  "optional_push_enabled, optional_sound_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

const ADMIN_OPS_PREFERENCE_SELECT = "sound_enabled";

export type ReadNormalizedNotificationPreferenceSnapshotOptions = Readonly<{
  now?: Date;
  timezone?: string;
}>;

/** Missing P2-A6 tables (Production apply NOT_PROVEN) must not fail Member/Owner reads. */
export function isMissingPreferenceRelationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /could not find the table|relation .* does not exist|schema cache/i.test(message)
  );
}

async function maybeSinglePreferenceRow<T>(
  query: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    if (isMissingPreferenceRelationError(error)) return null;
    // Non-missing errors: treat as absent for preference decision (fail-open to no-row compat).
    return null;
  }
  return data;
}

export async function readNormalizedNotificationPreferenceSnapshot(
  userId: string,
  options?: ReadNormalizedNotificationPreferenceSnapshotOptions,
  supabase?: SupabaseClient
): Promise<NormalizedNotificationPreferenceSnapshot> {
  const sb = supabase ?? getSupabaseServer();

  const [notificationSettingsRow, legacyUserSettingsRow, ownerSettingsRow, adminOpsPreferenceRow] =
    await Promise.all([
      maybeSinglePreferenceRow(
        sb
          .from("user_notification_settings")
          .select(NOTIFICATION_SETTINGS_SELECT)
          .eq("user_id", userId)
          .maybeSingle() as PromiseLike<{
          data: NotificationSettingsStorageRow | null;
          error: { code?: string; message?: string } | null;
        }>
      ),
      maybeSinglePreferenceRow(
        sb
          .from("user_settings")
          .select(LEGACY_USER_SETTINGS_PUSH_SELECT)
          .eq("user_id", userId)
          .maybeSingle() as PromiseLike<{
          data: LegacyUserSettingsPushRow | null;
          error: { code?: string; message?: string } | null;
        }>
      ),
      maybeSinglePreferenceRow(
        sb
          .from("owner_notification_settings")
          .select(OWNER_SETTINGS_SELECT)
          .eq("user_id", userId)
          .maybeSingle() as PromiseLike<{
          data: OwnerNotificationSettingsStorageRow | null;
          error: { code?: string; message?: string } | null;
        }>
      ),
      maybeSinglePreferenceRow(
        sb
          .from("admin_notification_preferences")
          .select(ADMIN_OPS_PREFERENCE_SELECT)
          .eq("user_id", userId)
          .maybeSingle() as PromiseLike<{
          data: AdminNotificationPreferenceStorageRow | null;
          error: { code?: string; message?: string } | null;
        }>
      ),
    ]);

  return normalizeNotificationPreferenceStorage({
    notificationSettingsRow,
    legacyUserSettingsRow,
    ownerSettingsRow,
    adminOpsPreferenceRow,
    now: options?.now ?? new Date(),
    timezone: options?.timezone,
  });
}
