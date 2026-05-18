/** Locale tag for admin delivery-orders date/time formatting. */
export function doAdminLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}
