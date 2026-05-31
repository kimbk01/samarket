export const SUPPORTED_APP_LANGUAGES = ["ko", "en"] as const;

/** DIBAY 정책·문서용 별칭 */
export const SUPPORTED_LANGUAGES = SUPPORTED_APP_LANGUAGES;

export type AppLanguageCode = (typeof SUPPORTED_APP_LANGUAGES)[number];

/** 레거시·알림 등 명시적 ko/en 없을 때 제품 기본값 */
export const DEFAULT_APP_LANGUAGE: AppLanguageCode = "ko";

/** 기기/Accept-Language에 ko가 없을 때 UI fallback (DIBAY: 그 외 영어) */
export const FALLBACK_APP_LANGUAGE: AppLanguageCode = "en";

/**
 * @deprecated DB/API 레거시 읽기 전용. 신규 저장은 `null`(기기 언어)만 사용.
 */
export const APP_LANGUAGE_PREFERENCE_SYSTEM = "system" as const;

/** DB·설정에 저장되는 값 — 명시 ko/en 또는 기기 언어 따름(null) */
export type StoredPreferredLanguage = AppLanguageCode | null;

/** @deprecated `StoredPreferredLanguage` 사용 */
export type AppLanguagePreference = StoredPreferredLanguage;

export const APP_LANGUAGE_STORAGE_KEY = "samarket_app_language";
export const APP_LANGUAGE_COOKIE = "samarket_signup_locale";
/** 최초 방문 시 기기 언어 1회 seed 완료 표시 (이후 navigator 재적용 금지) */
export const APP_LANGUAGE_DEVICE_SEEDED_KEY = "samarket_lang_device_seeded";
export const APP_LANGUAGE_CHANGED_EVENT = "samarket-language-changed";

/** cookie·localStorage·API 입력 길이 상한 — 비정상 값·DoS 방지 */
export const MAX_APP_LANGUAGE_INPUT_LENGTH = 32;

const LANGUAGE_ALIASES: Record<string, AppLanguageCode> = {
  ko: "ko",
  "ko-kr": "ko",
  en: "en",
  "en-us": "en",
  "en-gb": "en",
};

const SYSTEM_PREFERENCE_VALUES = new Set([
  "",
  "system",
  "auto",
  "device",
  "browser",
  "default",
]);

export function isSystemLanguagePreference(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== "string") return false;
  return SYSTEM_PREFERENCE_VALUES.has(input.trim().toLowerCase());
}

export function parseExplicitAppLanguage(input: unknown): AppLanguageCode | null {
  if (isSystemLanguagePreference(input)) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_APP_LANGUAGE_INPUT_LENGTH) return null;
  const normalized = trimmed.toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? null;
}

/** API·설정 저장 — 기기 언어(system·레거시·무효)는 null, 명시만 ko/en */
export function normalizeLanguagePreferenceForStorage(input: unknown): StoredPreferredLanguage {
  if (isSystemLanguagePreference(input)) return null;
  return parseExplicitAppLanguage(input);
}

/**
 * `profiles.preferred_language` NOT NULL 컬럼 전용 — **앱 UI source of truth 아님**.
 * 신규/갱신 시 앱 언어와 분리된 DB 호환값으로만 쓴다.
 */
export const PROFILE_DB_PREFERRED_LANGUAGE_FALLBACK = "system" as const;

/**
 * `user_settings.preferred_language` DB 저장 (임시 호환).
 *
 * - **목표(마이그레이션 후)**: SQL `NULL` = 기기 언어 따름
 * - **현재(NOT NULL text)**: 빈 문자열 `""` = 기기 언어 따름 — **임시 DB 호환값**
 * - API/앱 모델은 항상 `StoredPreferredLanguage`(ko | en | null)
 */
export function preferredLanguageToDbColumn(value: StoredPreferredLanguage): string {
  return value ?? "";
}

/** DB·profiles 레거시 값 → 저장 모델(null = 기기 언어) */
export function preferredLanguageFromDbColumn(value: unknown): StoredPreferredLanguage {
  return normalizeLanguagePreferenceForStorage(value);
}

/** UI 표시용 ko/en (system·미지원 → en fallback) */
export function normalizeAppLanguage(input: unknown): AppLanguageCode {
  return parseExplicitAppLanguage(input) ?? FALLBACK_APP_LANGUAGE;
}

/** @alias normalizeAppLanguage */
export function normalizeLanguage(input: unknown): AppLanguageCode {
  return normalizeAppLanguage(input);
}

/**
 * 사용자 선호 순서의 BCP47 목록에서 앱 UI 언어 결정.
 * - 목록에 ko가 있으면 ko (우선순위는 앞쪽 태그부터)
 * - 그 외 en 태그가 있으면 en
 * - 둘 다 없으면 FALLBACK_APP_LANGUAGE (en)
 */
export function resolveLanguageFromCandidates(candidates: readonly string[]): AppLanguageCode {
  for (const candidate of candidates) {
    if (parseExplicitAppLanguage(candidate) === "ko") return "ko";
  }
  for (const candidate of candidates) {
    if (parseExplicitAppLanguage(candidate) === "en") return "en";
  }
  return FALLBACK_APP_LANGUAGE;
}

/** 기기/브라우저 언어 (DIBAY: ko → 한국어, 그 외 → 영어) */
export function getBrowserLanguage(): AppLanguageCode {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return FALLBACK_APP_LANGUAGE;
  }
  const candidates =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  return resolveLanguageFromCandidates(candidates);
}

/** @deprecated Prefer `getBrowserLanguage` */
export function detectBrowserAppLanguage(): AppLanguageCode {
  return getBrowserLanguage();
}
