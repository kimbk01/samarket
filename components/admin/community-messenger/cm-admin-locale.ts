/** Locale tag for admin community-messenger date/time formatting. */
export function cmAdminLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}
