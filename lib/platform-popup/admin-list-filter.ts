/**
 * 팝업 / 당겨서 새로고침 관리자 목록 필터 값 (R7) — 클라이언트·서버 공용 순수 상수.
 * 서버 적용: `lib/platform-popup/admin-campaign-loader.ts` (`listPlatformPopupAdminCampaignPage` · `countPlatformPopupAdminCampaigns`).
 */

import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";

/** 상태 필터 특수값 — 「지금 노출 중」(운영 상태 ACTIVE: status=active · 시작 ≤ 지금 · 종료 없음/≥ 지금). */
export const PLATFORM_POPUP_LIVE_STATUS_FILTER = "live" as const;

/** 목록 화면 상태 필터 허용값 — 「지금 노출 중」 + DB 상태값. */
export const PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS: readonly string[] = [
  PLATFORM_POPUP_LIVE_STATUS_FILTER,
  ...PLATFORM_POPUP_CAMPAIGN_STATUSES,
];

export function platformPopupLiveStatusFilterLabel(lang: "ko" | "en"): string {
  return lang === "en" ? "Live now" : "지금 노출 중";
}
