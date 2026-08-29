/**
 * P2-A6 — Canonical writer for `owner_notification_settings` (account-level).
 * No consumer cutover. Returns normalized Owner slice only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NormalizedOwnerPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  type OwnerNotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

export type OwnerNotificationPreferenceWriteInput = Readonly<{
  optionalPushEnabled?: boolean | null;
  optionalSoundEnabled?: boolean | null;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}>;

const OWNER_SELECT =
  "optional_push_enabled, optional_sound_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

function trimTime(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function readOwnerNotificationPreference(
  userId: string,
  supabase?: SupabaseClient,
  now: Date = new Date()
): Promise<NormalizedOwnerPreferenceSnapshot> {
  const sb = supabase ?? getSupabaseServer();
  const { data } = await sb
    .from("owner_notification_settings")
    .select(OWNER_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeNotificationPreferenceStorage({
    ownerSettingsRow: data as OwnerNotificationSettingsStorageRow | null,
    now,
  }).owner!;
}

export async function upsertOwnerNotificationPreference(
  userId: string,
  input: OwnerNotificationPreferenceWriteInput,
  supabase?: SupabaseClient,
  now: Date = new Date()
): Promise<NormalizedOwnerPreferenceSnapshot> {
  const sb = supabase ?? getSupabaseServer();
  const { data: existing } = await sb
    .from("owner_notification_settings")
    .select(OWNER_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  const cur = (existing ?? null) as OwnerNotificationSettingsStorageRow | null;
  const payload = {
    user_id: userId,
    optional_push_enabled:
      input.optionalPushEnabled !== undefined
        ? input.optionalPushEnabled
        : (cur?.optional_push_enabled ?? null),
    optional_sound_enabled:
      input.optionalSoundEnabled !== undefined
        ? input.optionalSoundEnabled
        : (cur?.optional_sound_enabled ?? null),
    quiet_hours_enabled:
      input.quietHoursEnabled !== undefined
        ? input.quietHoursEnabled === true
        : cur?.quiet_hours_enabled === true,
    quiet_hours_start:
      input.quietHoursStart !== undefined
        ? trimTime(input.quietHoursStart)
        : trimTime(cur?.quiet_hours_start ?? null),
    quiet_hours_end:
      input.quietHoursEnd !== undefined
        ? trimTime(input.quietHoursEnd)
        : trimTime(cur?.quiet_hours_end ?? null),
    updated_at: now.toISOString(),
  };

  const { data, error } = await sb
    .from("owner_notification_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select(OWNER_SELECT)
    .single();

  if (error) {
    throw new Error(`owner_notification_settings_upsert_failed:${error.message}`);
  }

  return normalizeNotificationPreferenceStorage({
    ownerSettingsRow: data as OwnerNotificationSettingsStorageRow,
    now,
  }).owner!;
}
