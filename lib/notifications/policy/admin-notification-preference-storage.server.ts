/**
 * P2-A6 — Canonical writer for `admin_notification_preferences` (per-admin Ops sound).
 * Distinct from `admin_notification_settings` (global sound asset/config).
 * No AdminOpsRealtimeBridge / ADMIN_Q cutover.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NormalizedAdminOpsPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  type AdminNotificationPreferenceStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

export type AdminNotificationPreferenceWriteInput = Readonly<{
  soundEnabled?: boolean | null;
}>;

export async function readAdminNotificationPreference(
  userId: string,
  supabase?: SupabaseClient,
  now: Date = new Date()
): Promise<NormalizedAdminOpsPreferenceSnapshot> {
  const sb = supabase ?? getSupabaseServer();
  const { data } = await sb
    .from("admin_notification_preferences")
    .select("sound_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeNotificationPreferenceStorage({
    adminOpsPreferenceRow: data as AdminNotificationPreferenceStorageRow | null,
    now,
  }).adminOps!;
}

export async function upsertAdminNotificationPreference(
  userId: string,
  input: AdminNotificationPreferenceWriteInput,
  supabase?: SupabaseClient,
  now: Date = new Date()
): Promise<NormalizedAdminOpsPreferenceSnapshot> {
  const sb = supabase ?? getSupabaseServer();
  const { data: existing } = await sb
    .from("admin_notification_preferences")
    .select("sound_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  const cur = (existing ?? null) as AdminNotificationPreferenceStorageRow | null;
  const payload = {
    user_id: userId,
    sound_enabled:
      input.soundEnabled !== undefined ? input.soundEnabled : (cur?.sound_enabled ?? null),
    updated_at: now.toISOString(),
  };

  const { data, error } = await sb
    .from("admin_notification_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("sound_enabled")
    .single();

  if (error) {
    throw new Error(`admin_notification_preferences_upsert_failed:${error.message}`);
  }

  return normalizeNotificationPreferenceStorage({
    adminOpsPreferenceRow: data as AdminNotificationPreferenceStorageRow,
    now,
  }).adminOps!;
}
