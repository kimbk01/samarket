import type { AppLanguageCode } from "@/lib/i18n/config";

/**
 * Owner Admin presentation copy that must not tip MessageKey / KO_MESSAGES
 * declaration emit (TS7056). Prefer catalog when keys already exist.
 */
export function ownerUiCopy(
  language: AppLanguageCode | string | undefined,
  ko: string,
  en: string
): string {
  return language === "en" ? en : ko;
}
