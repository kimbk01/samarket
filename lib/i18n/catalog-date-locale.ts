import type { AppLanguageCode } from "@/lib/i18n/config";

/** Catalog may include zh-CN while AppLanguageCode is ko|en only. */
export type CatalogDateLanguage = AppLanguageCode | "zh-CN";

export function catalogDateLocale(language: CatalogDateLanguage): string {
  if (language === "ko") return "ko-KR";
  if (language === "zh-CN") return "zh-CN";
  return "en-PH";
}
