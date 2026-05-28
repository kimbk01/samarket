import type { AppLanguageCode } from "./config";
import { translate, type MessageKey } from "./messages";
import { looksLikeMessageKey } from "./safe-ui-label";

export type SafeTranslateOptions = {
  /** 한국어 모드 우선 fallback */
  fallbackKo?: string;
  /** 영어 모드 우선 fallback */
  fallbackEn?: string;
  vars?: Record<string, string | number>;
};

/** 치환되지 않은 `{name}` 플레이스홀더가 남아 있으면 UI에 노출하지 않음 */
const UNREPLACED_PLACEHOLDER = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/;

const HARDCODED_UNAVAILABLE: Record<AppLanguageCode, string> = {
  ko: "내용을 불러올 수 없습니다.",
  en: "Unable to load this content.",
};

const missingSafeTranslationWarned = new Set<string>();

function warnMissingTranslationKey(lang: AppLanguageCode, key: MessageKey): void {
  if (process.env.NODE_ENV === "production") return;
  const id = `${lang}:${key}`;
  if (missingSafeTranslationWarned.has(id)) return;
  missingSafeTranslationWarned.add(id);
  console.warn("[i18n-missing-translation]", lang, key);
}

export function pickLanguageFallback(
  lang: AppLanguageCode,
  opts?: Pick<SafeTranslateOptions, "fallbackKo" | "fallbackEn">
): string | undefined {
  const ko = opts?.fallbackKo?.trim();
  const en = opts?.fallbackEn?.trim();
  if (lang === "ko") return ko || en || undefined;
  return en || ko || undefined;
}

export function isUnsafeTranslationResult(key: MessageKey, raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (s === key) return true;
  if (looksLikeMessageKey(s)) return true;
  if (UNREPLACED_PLACEHOLDER.test(s)) return true;
  return false;
}

/** key 원문·slug 대신 사용자용 기본 문장 */
export function defaultUnavailableFallback(lang: AppLanguageCode): string {
  const fromCatalog = translate(lang, "common_content_unavailable").trim();
  if (!isUnsafeTranslationResult("common_content_unavailable", fromCatalog)) {
    return fromCatalog;
  }
  return HARDCODED_UNAVAILABLE[lang];
}

/**
 * UI 표시용 안전 번역 — key·빈 문자열·미치환 placeholder·snake_case 토큰을 화면에 노출하지 않음.
 * `translate()` 는 서버·역검색·로그용으로 그대로 두고, 화면은 `t()`(Provider) 또는 본 함수를 쓴다.
 */
export function safeTranslate(
  lang: AppLanguageCode,
  key: MessageKey,
  opts?: SafeTranslateOptions
): string {
  const vars = opts?.vars;
  const primary = translate(lang, key, vars).trim();
  if (!isUnsafeTranslationResult(key, primary)) return primary;

  const crossLang: AppLanguageCode = lang === "ko" ? "en" : "ko";
  const cross = translate(crossLang, key, vars).trim();
  if (!isUnsafeTranslationResult(key, cross)) return cross;

  const picked = pickLanguageFallback(lang, opts);
  if (picked) return picked;

  warnMissingTranslationKey(lang, key);
  return defaultUnavailableFallback(lang);
}

export function safeTranslateText(
  lang: AppLanguageCode,
  text: string,
  opts?: SafeTranslateOptions
): string {
  const s = text.trim();
  if (!s) return pickLanguageFallback(lang, opts) ?? defaultUnavailableFallback(lang);
  if (looksLikeMessageKey(s)) {
    return safeTranslate(lang, s as MessageKey, opts);
  }
  return s;
}
