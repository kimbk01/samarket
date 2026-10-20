/**
 * Group Customer Center board list rows by calendar day — 필리핀 시간(Asia/Manila) 기준 (최종 설계 S61).
 * 날짜 글자는 `formatMypageDate`(내정보 날짜 SSOT) — `toLocale*` 직접 사용 금지.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { localeTagForAppLanguage } from "@/lib/i18n/locale-for-app-language";
import {
  formatMypageDate,
  mypageDateGroupKey,
  MYPAGE_DISPLAY_TIME_ZONE,
} from "@/lib/mypage/format-mypage-date";

export type CustomerCenterDateSection<T extends { createdAt: string }> = {
  sectionKey: string;
  sectionLabel: string;
  items: T[];
};

export function groupCustomerCenterItemsByDate<T extends { createdAt: string }>(
  items: T[],
  language: AppLanguageCode
): CustomerCenterDateSection<T>[] {
  if (items.length === 0) return [];
  const buckets = new Map<string, { label: string; items: T[] }>();
  const order: string[] = [];

  for (const item of items) {
    const day = mypageDateGroupKey(item.createdAt, "day");
    const key = day ? `d:${day}` : "d:";
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label: day ? formatMypageDate(item.createdAt, { style: "date", lang: language }) : "", items: [] };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.items.push(item);
  }

  order.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return order.map((key) => {
    const b = buckets.get(key);
    return { sectionKey: key, sectionLabel: b?.label ?? "", items: b?.items ?? [] };
  });
}

/** 목록 행 날짜 — 월/일(필리핀 시간). 잘못된 값이면 빈 문자열. */
export function formatCustomerCenterRowDate(iso: string | null | undefined, language: AppLanguageCode): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(localeTagForAppLanguage(language), {
    month: "numeric",
    day: "numeric",
    timeZone: MYPAGE_DISPLAY_TIME_ZONE,
  }).format(d);
}
