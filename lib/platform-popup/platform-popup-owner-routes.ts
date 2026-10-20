/**
 * CUT 5 — Owner Platform Popup request routes (separate from delivery_ad campaigns).
 */

export const PLATFORM_POPUP_OWNER_ROUTES = {
  createPlatformPopup: "/stores/owner/ads/new/platform-popup",
  popupRequestDetail: (requestId: string) =>
    `/stores/owner/ads/popup/${encodeURIComponent(requestId)}`,
} as const;

export const PLATFORM_POPUP_ADMIN_REQUEST_ROUTES = {
  /**
   * 오너 신청 목록 = 광고 작업 「팝업」 종류 (서버 페이지 · 신청 전체 상태). `/admin/platform-popup/requests` 는 이 주소로 보낸다.
   * (예전 `/admin/platform-popup?tab=requests` 는 연결된 화면이 없었다 — 팝업 화면은 캠페인 목록만 그린다.)
   */
  queue: "/admin/advertising?family=popup",
  detail: (requestId: string) =>
    `/admin/platform-popup/requests/${encodeURIComponent(requestId)}`,
} as const;
