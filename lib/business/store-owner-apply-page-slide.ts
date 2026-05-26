/** 내정보 → `/stores/owner/apply` — 우→좌 진입 / 좌→우 복귀 */
export const STORE_OWNER_APPLY_PAGE_SLIDE_MS = 370;

export const STORE_OWNER_APPLY_PAGE_SLIDE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export const STORE_OWNER_APPLY_ROUTE_ENTER_CLASSES = [
  "store-owner-apply-route-enter-rtl-forward",
  "store-owner-apply-route-enter-ltr-back",
] as const;
