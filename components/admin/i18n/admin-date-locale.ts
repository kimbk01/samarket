import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatAdminManilaDate, formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function adminDateLocaleTag(language: AppLanguageCode | string): string {
  return language === "en" ? "en-US" : "ko-KR";
}

/**
 * 관리자 일시 표시 — 설계 v4 §6: 기기 시간대와 무관하게 Asia/Manila(PHT) 「YYYY-MM-DD HH:mm」.
 * `language` 는 호출부 호환을 위해 유지한다 (숫자형 표기라 언어별 차이 없음). 잘못된 값 = "".
 */
export function formatAdminDateTime(iso: string, _language?: AppLanguageCode | string): string {
  if (!Number.isFinite(Date.parse(String(iso ?? "")))) return "";
  return formatAdminManilaDateTime(iso);
}

/** 관리자 날짜 표시 — PHT 「YYYY-MM-DD」. 잘못된 값 = "". */
export function formatAdminDate(iso: string, _language?: AppLanguageCode | string): string {
  if (!Number.isFinite(Date.parse(String(iso ?? "")))) return "";
  return formatAdminManilaDate(iso);
}
