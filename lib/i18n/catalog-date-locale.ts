import type { AppLanguageCode } from "@/lib/i18n/config";

export type CatalogDateLanguage = AppLanguageCode;

export function catalogDateLocale(language: CatalogDateLanguage): string {
  if (language === "ko") return "ko-KR";
  return "en-PH";
}
