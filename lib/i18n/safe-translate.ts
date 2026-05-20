import type { AppLanguageCode } from "./config";
import { translate, type MessageKey } from "./messages";
import { humanizeMessageKeySlug, looksLikeMessageKey } from "./safe-ui-label";

export type SafeTranslateOptions = {
  /** 한국어 모드 우선 fallback */
  fallbackKo?: string;
  /** 영어 모드 우선 fallback */
  fallbackEn?: string;
  vars?: Record<string, string | number>;
};

/** 치환되지 않은 `{name}` 플레이스홀더가 남아 있으면 UI에 노출하지 않음 */
const UNREPLACED_PLACEHOLDER = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/;

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

/** 마지막 수단 — key slug를 사람이 읽을 수 있는 영문 라벨로 (catalog 보강 전 임시 노출 방지) */
export function humanizeMessageKeyForDisplay(key: MessageKey): string {
  return humanizeMessageKeySlug(key);
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

  return humanizeMessageKeyForDisplay(key);
}

export function safeTranslateText(
  lang: AppLanguageCode,
  text: string,
  opts?: SafeTranslateOptions
): string {
  const s = text.trim();
  if (!s) return pickLanguageFallback(lang, opts) ?? humanizeMessageKeySlug(s || "label");
  if (looksLikeMessageKey(s)) {
    return safeTranslate(lang, s as MessageKey, opts);
  }
  return s;
}
