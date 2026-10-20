/**
 * 포인트 화면(S40) 탭 — `?tab=all|credit|debit|charges` (C4: 설계 [전체·적립·사용·충전]).
 * credit=적립, debit=사용(내역 API 필터), charges=같은 응답의 충전 요청 목록(추가 요청 0).
 * 기존 링크 `?view=charges` 는 `?tab=charges` 로 정규화한다.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { localeTagForAppLanguage } from "@/lib/i18n/locale-for-app-language";
import type { PointChargeRequest } from "@/lib/types/point";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";

export type PointsScreenTab = PointFinancialFilter | "charges";

export const POINTS_SCREEN_TAB_VALUES: readonly PointsScreenTab[] = ["all", "credit", "debit", "charges"];

/** 기존 `view=charges` 링크 → 정규화 후 URL(쿼리 문자열, `?` 제외). 바꿀 것이 없으면 null */
export function normalizePointsLegacyViewQuery(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("view") !== "charges") return null;
  params.delete("view");
  params.set("tab", "charges");
  return params.toString();
}

/** 내역 API 필터 — 충전 탭은 직전 내역 필터를 그대로 둔다(재조회 없음) */
export function pointsHistoryFilterForTab(tab: PointsScreenTab, previous: PointFinancialFilter): PointFinancialFilter {
  return tab === "charges" ? previous : tab;
}

/** 취소할 수 있는 대기 건만 — 보류(on_hold)는 회원이 취소할 수 없어 집계에서 제외 (D19) */
export function countCancellableChargeRequests(requests: readonly PointChargeRequest[]): number {
  return requests.filter((c) => isChargeRequestCancellable(c.requestStatus)).length;
}

export function isChargeRequestCancellable(status: PointChargeRequest["requestStatus"]): boolean {
  return status === "pending" || status === "waiting_confirm";
}

/** 월 묶음 키 `YYYY-MM` → 회원 언어 월 표시(ko "2026년 11월") — 키 자체가 필리핀 시간 기준이라 UTC 로 고정 포맷 */
export function formatExpiringMonthLabel(monthKey: string, lang: AppLanguageCode): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) return monthKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15));
  return new Intl.DateTimeFormat(localeTagForAppLanguage(lang), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

/** S43 직접 진입 시 뒤로 — 판매물품 ⋮ [더 알리기](`postId`)에서 왔으면 판매물품, 아니면 포인트 (UI-6 URL 불변) */
export function resolvePromotionsBackHref(postId: string | null | undefined): string {
  return String(postId ?? "").trim() ? "/mypage/products" : "/mypage/points";
}
