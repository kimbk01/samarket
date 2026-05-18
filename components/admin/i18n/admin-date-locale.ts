import type { AppLanguageCode } from "@/lib/i18n/config";

export function adminDateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}
