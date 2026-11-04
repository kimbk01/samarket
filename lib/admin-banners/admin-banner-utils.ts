/**
 * 20단계: 배너 필터/정렬/옵션
 */

import type { AdminBanner, BannerStatus } from "@/lib/types/admin-banner";

export const BANNER_STATUS_OPTIONS: { value: BannerStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "active", label: "활성" },
  { value: "paused", label: "일시중지" },
  { value: "expired", label: "만료" },
  { value: "hidden", label: "숨김" },
];

/* 광고 감사 B-6: 쓰는 곳 없던 레거시 위치 목록(home_top·home_middle·product_detail·search_top) 제거 —
 * 마이페이지 CMS 배너는 저장 시 `mypage_top` 고정(`admin-banners-db.ts`). */

/**
 * 광고 최종 점검 B-7: 화면에 보이는 상태 — 저장 상태가 「활성」이어도 종료 시각이 지났으면 고객에게 나오지 않으므로
 * 「만료」로 보여 준다 (고객 조회 `myPageBannerLiveWindowFilters` 와 같은 규칙: 종료 시각과 같은 순간부터 제외).
 * 저장값은 바꾸지 않는다(표시만).
 */
/** 화면 표시 상태 — 저장 상태 + MB-A01 「예정」(활성인데 시작 전) */
export type AdminBannerDisplayStatus = BannerStatus | "scheduled";

/**
 * MB-A01 (Owner 「설계안대로」 2026-11-04): 「활성」인데 시작 시각 전이면 고객에게 아직 안 나오므로 「예정」으로 보인다
 * (고객 조회 `myPageBannerLiveWindowFilters` 와 같은 규칙: 시작 시각과 같은 순간부터 노출).
 */
export function adminBannerDisplayStatus(
  banner: Pick<AdminBanner, "status" | "endAt"> & Partial<Pick<AdminBanner, "startAt">>,
  nowMs: number = Date.now()
): AdminBannerDisplayStatus {
  if (banner.status !== "active") return banner.status;
  const end = banner.endAt ? Date.parse(banner.endAt) : NaN;
  if (Number.isFinite(end) && end <= nowMs) return "expired";
  const start = banner.startAt ? Date.parse(banner.startAt) : NaN;
  if (Number.isFinite(start) && start > nowMs) return "scheduled";
  return "active";
}

export interface AdminBannerFilters {
  status: BannerStatus | "";
}

export function filterBanners(
  list: AdminBanner[],
  filters: AdminBannerFilters
): AdminBanner[] {
  let result = [...list];
  if (filters.status)
    result = result.filter((b) => adminBannerDisplayStatus(b) === filters.status);
  return result.sort((a, b) => a.priority - b.priority);
}
