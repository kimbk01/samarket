import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_APP_LANGUAGE,
  normalizeAppLanguage,
  parseExplicitAppLanguage,
  type AppLanguageCode,
} from "@/lib/i18n/config";

/**
 * 인앱·푸시·이메일 알림 문구 언어 (받는 사람 기준).
 * B-21: 앱 언어의 source of truth 는 `user_settings.preferred_language`(앱 설정 → 언어). 명시값(ko/en)이면 그것을,
 * 비었거나 「기기 언어」면 기존대로 `profiles.preferred_language` 를 쓴다.
 */
export async function loadNotificationUserLanguage(
  sb: SupabaseClient,
  userId: string
): Promise<AppLanguageCode> {
  const uid = userId.trim();
  if (!uid) return DEFAULT_APP_LANGUAGE;
  const [settingsLanguage, profileRow] = await Promise.all([
    readUserSettingsLanguage(sb, uid),
    sb.from("profiles").select("preferred_language").eq("id", uid).maybeSingle(),
  ]);
  if (settingsLanguage) return settingsLanguage;
  return normalizeAppLanguage(
    (profileRow.data as { preferred_language?: unknown } | null)?.preferred_language
  );
}

async function readUserSettingsLanguage(sb: SupabaseClient, uid: string): Promise<AppLanguageCode | null> {
  try {
    const { data, error } = await sb
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) return null;
    return parseExplicitAppLanguage((data as { preferred_language?: unknown } | null)?.preferred_language);
  } catch {
    return null;
  }
}
