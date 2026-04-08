export const SUPPORTED_APP_LANGUAGES = ["ko", "en", "zh-CN"] as const;

export type AppLanguageCode = (typeof SUPPORTED_APP_LANGUAGES)[number];

export const DEFAULT_APP_LANGUAGE: AppLanguageCode = "ko";

export const APP_LANGUAGE_STORAGE_KEY = "samarket_app_language";
export const APP_LANGUAGE_COOKIE = "samarket_signup_locale";
export const APP_LANGUAGE_CHANGED_EVENT = "samarket-language-changed";

const LANGUAGE_ALIASES: Record<string, AppLanguageCode> = {
  ko: "ko",
  "ko-kr": "ko",
  en: "en",
  "en-us": "en",
  "en-gb": "en",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-sg": "zh-CN",
};

export function normalizeAppLanguage(input: unknown): AppLanguageCode {
  if (typeof input !== "string") return DEFAULT_APP_LANGUAGE;
  const normalized = input.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? DEFAULT_APP_LANGUAGE;
}

function resolveAlias(input: unknown): AppLanguageCode | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? null;
}

export function detectBrowserAppLanguage(): AppLanguageCode {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return DEFAULT_APP_LANGUAGE;
  }
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
  for (const candidate of candidates) {
    const resolved = resolveAlias(candidate);
    if (resolved) return resolved;
  }
  return DEFAULT_APP_LANGUAGE;
}
