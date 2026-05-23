import { adminDateLocaleTag } from "@/components/admin/i18n/admin-date-locale";
import type { AppLanguageCode } from "@/lib/i18n/config";

/** Locale tag for admin delivery-orders date/time formatting. */
export function doAdminLocale(language: string): string {
  return adminDateLocaleTag(language as AppLanguageCode);
}
