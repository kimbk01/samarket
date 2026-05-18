import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";

/** 인앱·이메일 알림 문구용 — profiles.preferred_language */
export async function loadNotificationUserLanguage(
  sb: SupabaseClient,
  userId: string
): Promise<AppLanguageCode> {
  const uid = userId.trim();
  if (!uid) return DEFAULT_APP_LANGUAGE;
  const { data } = await sb
    .from("profiles")
    .select("preferred_language")
    .eq("id", uid)
    .maybeSingle();
  return normalizeAppLanguage((data as { preferred_language?: unknown } | null)?.preferred_language);
}
