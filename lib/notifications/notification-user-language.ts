import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_APP_LANGUAGE,
  FALLBACK_APP_LANGUAGE,
  parseExplicitAppLanguage,
  type AppLanguageCode,
} from "@/lib/i18n/config";

/**
 * 인앱·푸시·이메일 알림 문구 언어 (받는 사람 기준) — 언어 SSOT S8-6 (`docs/audit/i18n-s8-native-plan-2026-11-08.md` §17).
 * 1) 계정 명시값 `user_settings.preferred_language`(ko/en)
 * 2) 기기 언어 따름이면 → 최근 활성 기기의 앱 언어 `user_devices.app_language`(웹이 시작·변경 때 기록)
 * 3) 둘 다 없으면 → en
 * 폐기 열 `profiles.preferred_language` 는 읽지 않는다. 채팅 목록 DB 함수 `get_chat_rooms_snapshot.user_lang` 도 같은 순서.
 * 통화 푸시(VoIP/FCM) 제목·본문은 이 함수를 쓰지 않는다(구 앱 판정 의존 — §1 원칙 2).
 */
export async function loadNotificationUserLanguage(
  sb: SupabaseClient,
  userId: string
): Promise<AppLanguageCode> {
  const uid = userId.trim();
  if (!uid) return DEFAULT_APP_LANGUAGE;
  const [settingsLanguage, deviceLanguage] = await Promise.all([
    readUserSettingsLanguage(sb, uid),
    readRecentDeviceAppLanguage(sb, uid),
  ]);
  return resolveNotificationLanguage(settingsLanguage, deviceLanguage);
}

/** 순수 순서 — 계정 명시값 → 최근 기기 앱 언어 → en */
export function resolveNotificationLanguage(account: unknown, device: unknown): AppLanguageCode {
  return parseExplicitAppLanguage(account) ?? parseExplicitAppLanguage(device) ?? FALLBACK_APP_LANGUAGE;
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

async function readRecentDeviceAppLanguage(sb: SupabaseClient, uid: string): Promise<AppLanguageCode | null> {
  try {
    const { data, error } = await sb
      .from("user_devices")
      .select("app_language")
      .eq("user_id", uid)
      .eq("is_active", true)
      .not("app_language", "is", null)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error || !Array.isArray(data)) return null;
    return parseExplicitAppLanguage((data[0] as { app_language?: unknown } | undefined)?.app_language);
  } catch {
    return null;
  }
}
