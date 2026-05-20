import type { AppLanguageCode } from "@/lib/i18n/config";

export function adminDateLocaleTag(language: AppLanguageCode | string): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function formatAdminDateTime(iso: string, language: AppLanguageCode | string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(adminDateLocaleTag(language));
}

export function formatAdminDate(iso: string, language: AppLanguageCode | string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(adminDateLocaleTag(language));
}
