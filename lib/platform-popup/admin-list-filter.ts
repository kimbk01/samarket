/**
 * 팝업 / 당겨서 새로고침 관리자 목록 필터 값 (R7) — 클라이언트·서버 공용 순수 상수.
 * 서버 적용: `lib/platform-popup/admin-campaign-loader.ts` (`listPlatformPopupAdminCampaignPage` · `countPlatformPopupAdminCampaigns`).
 */

import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";
import { translateBy } from "@/lib/i18n/translate-by";
import {
  PLATFORM_POPUP_APPLIED_LIVE_FILTER,
  PLATFORM_POPUP_APPLIED_NOT_SHOWN_FILTER,
} from "@/lib/platform-popup/admin-applied-status-contract";

/**
 * 상태 필터 특수값 — 「앱에 나오는 중」.
 * - 팝업 목록(v3 ④): 서버 「앱에 나오나」가 나오는 중·조건부인 캠페인 (`admin-applied-status.ts` · 앱 조회와 같은 자격 함수)
 * - 당겨서 새로고침 목록: 운영 상태 ACTIVE (status=active · 시작 ≤ 지금 · 종료 없음/≥ 지금)
 */
export const PLATFORM_POPUP_LIVE_STATUS_FILTER = PLATFORM_POPUP_APPLIED_LIVE_FILTER;
/** v3 ④ 팝업 목록 — 「안 나옴」 (서버 「앱에 나오나」 = 안 나옴) */
export const PLATFORM_POPUP_NOT_SHOWN_STATUS_FILTER = PLATFORM_POPUP_APPLIED_NOT_SHOWN_FILTER;

/** 목록 화면 상태 필터 허용값 — 「앱에 나오는 중」·「안 나옴」 + DB 상태값. */
export const PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS: readonly string[] = [
  PLATFORM_POPUP_LIVE_STATUS_FILTER,
  PLATFORM_POPUP_NOT_SHOWN_STATUS_FILTER,
  ...PLATFORM_POPUP_CAMPAIGN_STATUSES,
];

export function platformPopupLiveStatusFilterLabel(lang: "ko" | "en"): string {
  return translateBy(lang, "platform_popup_live_now");
}
