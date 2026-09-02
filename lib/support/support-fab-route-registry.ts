/**
 * Explicit Support FAB opt-in registry — contract test SSOT.
 * Routes listed here must wrap content with SupportContextProvider (enabled: true).
 * Forbidden routes must NOT appear.
 */

export const SUPPORT_FAB_ENABLED_ROUTE_FILES = [
  "app/(main)/mypage/points/charge/page.tsx",
  "app/(main)/mypage/gift-certificates/[instanceId]/page.tsx",
  "app/(main)/mypage/store-orders/[orderId]/page.tsx",
  "app/(main)/mypage/ads/feed-request/page.tsx",
  "app/(main)/mypage/coupons/page.tsx",
  "app/(main)/stores/owner/apply/page.tsx",
  "app/(main)/stores/owner/finance/page.tsx",
  "app/(main)/stores/owner/settlements/page.tsx",
  "app/(main)/stores/owner/ads/[campaignId]/page.tsx",
  "app/(main)/stores/owner/ads/new/banner/page.tsx",
  "app/(main)/stores/owner/ads/new/store-sponsored/page.tsx",
  "app/(main)/stores/owner/products/[productId]/edit/page.tsx",
  "app/(main)/stores/owner/coupons/page.tsx",
  "app/(main)/stores/owner/gift-certificates/page.tsx",
  "app/(main)/stores/owner/basic-info/page.tsx",
  "app/(main)/stores/owner/ops-status/page.tsx",
] as const;

/** View-level opt-in when route page delegates to a child component. */
export const SUPPORT_FAB_ENABLED_VIEW_FILES = [
  "components/mypage/MyStoreOrderDetailView.tsx",
] as const;

export const SUPPORT_FAB_FORBIDDEN_ROUTE_FILES = [
  "app/(main)/mypage/page.tsx",
  "app/(main)/stores/owner/page.tsx",
  "app/(main)/stores/owner/customer-care/page.tsx",
  "app/(main)/mypage/customer-center/page.tsx",
] as const;
