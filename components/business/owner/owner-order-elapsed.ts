import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

export function formatOwnerOrderElapsed(
  createdAt: string,
  lang: AppLanguageCode = "ko"
): string {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return translate(lang, "store_owner_elapsed_hours", {
      hours: String(h),
      minutes: String(mm),
    });
  }
  return translate(lang, "store_owner_elapsed_minutes", {
    minutes: String(m),
    seconds: s.toString().padStart(2, "0"),
  });
}

/** @deprecated use `formatOwnerOrderElapsed` */
export function formatOwnerOrderElapsedKo(createdAt: string): string {
  return formatOwnerOrderElapsed(createdAt, "ko");
}
