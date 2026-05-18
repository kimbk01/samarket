import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_APP_LANGUAGE,
  parseExplicitAppLanguage,
  type AppLanguageCode,
} from "@/lib/i18n/config";
import { detectAcceptLanguageAppLanguage } from "@/lib/i18n/language-preference";

/** API·서버 — `user_settings.preferred_language` 우선, 없으면 Accept-Language */
export async function loadUserAppLanguage(
  sb: SupabaseClient | null,
  userId: string,
  acceptLanguage?: string | null
): Promise<AppLanguageCode> {
  const uid = userId.trim();
  if (sb && uid) {
    const { data } = await sb
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", uid)
      .maybeSingle();
    const explicit = parseExplicitAppLanguage(
      (data as { preferred_language?: unknown } | null)?.preferred_language
    );
    if (explicit) return explicit;
  }
  if (acceptLanguage?.trim()) {
    return detectAcceptLanguageAppLanguage(acceptLanguage);
  }
  return DEFAULT_APP_LANGUAGE;
}
