/**
 * user_settings 조회/저장
 * Supabase 연동 시 user_settings 테이블 사용, 미설정 시 localStorage fallback
 */
import type { UserSettingsRow } from "@/lib/types/settings-db";
import { DEFAULT_USER_SETTINGS } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";
import { APP_LANGUAGE_CHANGED_EVENT, normalizeAppLanguage } from "@/lib/i18n/config";

const STORAGE_KEY = "kasama_user_settings";

function getStored(userId: string): Partial<UserSettingsRow> {
  if (typeof window === "undefined") return { ...DEFAULT_USER_SETTINGS };
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

function setStored(userId: string, partial: Partial<UserSettingsRow>): void {
  if (typeof window === "undefined") return;
  const next = { ...getStored(userId), ...partial };
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(next));
}

/** 현재 사용자 설정 조회 (Supabase 없으면 localStorage) */
export function getUserSettings(userId: string): Partial<UserSettingsRow> {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: supabase.from('user_settings').select('*').eq('user_id', userId).single()
    // then return data ?? DEFAULT_USER_SETTINGS
  }
  return getStored(userId);
}

/** 설정 일부 업데이트 (Supabase 없으면 localStorage) */
export function updateUserSettings(
  userId: string,
  partial: Partial<UserSettingsRow>
): void {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: supabase.from('user_settings').upsert({ user_id: userId, ...partial, updated_at: new Date().toISOString() })
  }
  setStored(userId, partial);
  if (typeof window !== "undefined" && "preferred_language" in partial && partial.preferred_language) {
    window.dispatchEvent(
      new CustomEvent(APP_LANGUAGE_CHANGED_EVENT, {
        detail: normalizeAppLanguage(partial.preferred_language),
      })
    );
  }
}

export const LANGUAGE_NAMES: Record<string, string> = {
  ko: "한국어",
  en: "English",
  "zh-CN": "简体中文",
};

export const COUNTRY_NAMES: Record<string, string> = {
  PH: "필리핀",
  KR: "한국",
  US: "미국",
};

export const VIDEO_AUTOPLAY_LABELS: Record<string, string> = {
  always: "항상",
  wifi_only: "Wi-Fi에서만",
  never: "끔",
};
