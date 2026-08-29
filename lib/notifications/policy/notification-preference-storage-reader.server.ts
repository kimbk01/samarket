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

export async function readNormalizedNotificationPreferenceSnapshot(
  userId: string,
  options?: ReadNormalizedNotificationPreferenceSnapshotOptions,
  supabase?: SupabaseClient
): Promise<NormalizedNotificationPreferenceSnapshot> {
  const sb = supabase ?? getSupabaseServer();

  const [
    { data: notificationSettingsRow },
    { data: legacyUserSettingsRow },
    { data: ownerSettingsRow },
    { data: adminOpsPreferenceRow },
  ] = await Promise.all([
    sb
      .from("user_notification_settings")
      .select(NOTIFICATION_SETTINGS_SELECT)
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("user_settings")
      .select(LEGACY_USER_SETTINGS_PUSH_SELECT)
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("owner_notification_settings")
      .select(OWNER_SETTINGS_SELECT)
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("admin_notification_preferences")
      .select(ADMIN_OPS_PREFERENCE_SELECT)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return normalizeNotificationPreferenceStorage({
    notificationSettingsRow: notificationSettingsRow as NotificationSettingsStorageRow | null,
    legacyUserSettingsRow: legacyUserSettingsRow as LegacyUserSettingsPushRow | null,
    ownerSettingsRow: ownerSettingsRow as OwnerNotificationSettingsStorageRow | null,
    adminOpsPreferenceRow: adminOpsPreferenceRow as AdminNotificationPreferenceStorageRow | null,
    now: options?.now ?? new Date(),
    timezone: options?.timezone,
  });
}
