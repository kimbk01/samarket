import type { AppLanguageCode } from "./config";

/** UI 날짜·숫자 포맷용 BCP 47 */
export function localeTagForAppLanguage(lang: AppLanguageCode): string {
  return lang === "en" ? "en-US" : "ko-KR";
}

export function formatAppDate(
  iso: string,
  lang: AppLanguageCode,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(localeTagForAppLanguage(lang), options);
}

export function formatAppDateTime(iso: string, lang: AppLanguageCode): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(localeTagForAppLanguage(lang));
}

export function formatAppNumber(n: number, lang: AppLanguageCode): string {
  return n.toLocaleString(localeTagForAppLanguage(lang));
}
