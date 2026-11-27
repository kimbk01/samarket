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
 * 부재중 통화 알림(알림함 저장 글자)도 이 순서를 쓴다. 통화 신호 푸시(수신·취소·다른 기기 받음)와 알림 푸시의 글자는
 * 조회 없이 대상 기기 행의 `app_language` 로 기기마다 고른다(`lib/push/dispatch/localized-push-alert.ts`, 2026-11-27 C2·C3).
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

/**
 * 여러 받는 사람의 알림 언어를 한 번에 — user_settings 1회 + user_devices 1회 (단건 `loadNotificationUserLanguage` 와 같은 판정).
 * 여러 명에게 같은 알림을 보낼 때 받는 사람마다 2회씩 읽지 않게 한다 (2026-11-28 모임 3번 묶음 E1).
 * 조회가 실패한 사람은 단건과 같이 기본값(en)으로 간다.
 */
export async function loadNotificationUserLanguages(sb: SupabaseClient, userIds: string[]): Promise<Map<string, AppLanguageCode>> {
  const ids = [...new Set(userIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const out = new Map<string, AppLanguageCode>();
  if (!ids.length) return out;
  const settings = new Map<string, AppLanguageCode | null>();
  const devices = new Map<string, AppLanguageCode | null>();
  /** 기기 행이 사람당 여러 개라 한 번에 적게 묻는다(응답 최대 행 수 1000 안) — 그래도 상한에 닿으면 기기 값을 못 받은 사람만 단건으로 (재감사 L2) */
  const CHUNK = 50;
  const ROW_CAP = 1000;
  const needSingle: string[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const [s, d] = await Promise.all([
      sb.from("user_settings").select("user_id, preferred_language").in("user_id", part),
      sb
        .from("user_devices")
        .select("user_id, app_language, last_seen_at")
        .in("user_id", part)
        .eq("is_active", true)
        .not("app_language", "is", null)
        .order("last_seen_at", { ascending: false, nullsFirst: false }),
    ]);
    for (const r of ((s.error ? [] : s.data) ?? []) as { user_id: string; preferred_language?: unknown }[]) {
      settings.set(r.user_id, parseExplicitAppLanguage(r.preferred_language));
    }
    // 최근 기기 먼저 정렬돼 있으므로 사람마다 처음 본 행 = 단건의 limit(1) 과 같은 행
    const deviceRows = ((d.error ? [] : d.data) ?? []) as { user_id: string; app_language?: unknown }[];
    for (const r of deviceRows) {
      if (!devices.has(r.user_id)) devices.set(r.user_id, parseExplicitAppLanguage(r.app_language));
    }
    if (deviceRows.length >= ROW_CAP) for (const id of part) if (!devices.has(id)) needSingle.push(id);
  }
  for (const id of needSingle) devices.set(id, await readRecentDeviceAppLanguage(sb, id));
  for (const id of ids) out.set(id, resolveNotificationLanguage(settings.get(id) ?? null, devices.get(id) ?? null));
  return out;
}
