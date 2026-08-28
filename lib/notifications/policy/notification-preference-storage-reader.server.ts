/**
 * P2-A4 — Server-side notification preference READ authority.
 *
 * Fetches current storage rows and delegates to the pure normalizer.
 * Does not resolve event policy or mutate storage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  type LegacyUserSettingsPushRow,
  type NotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

const NOTIFICATION_SETTINGS_SELECT =
  "service_enabled, trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled, trade_events_enabled, community_social_enabled, notice_enabled, marketing_enabled, sound_enabled, vibration_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

const LEGACY_USER_SETTINGS_PUSH_SELECT =
  "push_enabled, chat_push_enabled, marketing_push_enabled, do_not_disturb_enabled, do_not_disturb_start, do_not_disturb_end";

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

  const [{ data: notificationSettingsRow }, { data: legacyUserSettingsRow }] = await Promise.all([
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
  ]);

  return normalizeNotificationPreferenceStorage({
    notificationSettingsRow: notificationSettingsRow as NotificationSettingsStorageRow | null,
    legacyUserSettingsRow: legacyUserSettingsRow as LegacyUserSettingsPushRow | null,
    now: options?.now ?? new Date(),
    timezone: options?.timezone,
  });
}
