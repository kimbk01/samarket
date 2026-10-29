/**
 * 앱 메타(`public.app_meta`) 관리 키 — 관리자 화면·API 공통 (v2.1 B2).
 * 소비처: GET /api/me/settings/version (버전 화면 · Android Play 인앱 업데이트 정책).
 * 빈 값으로 저장하면 행을 지워 기본 동작(강제 업데이트 없음 · 대체 버전)으로 돌아간다.
 */
export const APP_META_KEYS = [
  "app_version",
  "app_build",
  "android_min_version_code",
  "android_immediate_update",
] as const;

export type AppMetaKey = (typeof APP_META_KEYS)[number];

/** 켜기/끄기 스위치로 저장하는 키 — 켜짐 = "true", 꺼짐 = 빈 값(기본 동작). */
export const APP_META_TOGGLE_KEYS = ["android_immediate_update"] as const satisfies readonly AppMetaKey[];

export function isAppMetaToggleKey(key: string): boolean {
  return (APP_META_TOGGLE_KEYS as readonly string[]).includes(key);
}

export function isAppMetaKey(key: string): key is AppMetaKey {
  return (APP_META_KEYS as readonly string[]).includes(key);
}

const VALIDATORS: Record<AppMetaKey, RegExp> = {
  app_version: /^\d{1,4}(\.\d{1,4}){0,3}$/,
  app_build: /^\d{1,9}$/,
  android_min_version_code: /^\d{1,9}$/,
  android_immediate_update: /^(true|false)$/,
};

/** 정규화된 값(빈 문자열 = 삭제) 또는 null(형식 오류) */
export function normalizeAppMetaValue(key: AppMetaKey, raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "") return "";
  return VALIDATORS[key].test(v) ? v : null;
}
