/**
 * CUT 5 — Owner Platform Popup request routes (separate from delivery_ad campaigns).
 */

export const PLATFORM_POPUP_OWNER_ROUTES = {
  createPlatformPopup: "/stores/owner/ads/new/platform-popup",
  popupRequestDetail: (requestId: string) =>
    `/stores/owner/ads/popup/${encodeURIComponent(requestId)}`,
} as const;

export const PLATFORM_POPUP_ADMIN_REQUEST_ROUTES = {
  queue: "/admin/platform-popup",
  detail: (requestId: string) =>
    `/admin/platform-popup/requests/${encodeURIComponent(requestId)}`,
} as const;
