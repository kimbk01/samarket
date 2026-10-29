/**
 * 묶음4 F-09 — 고객 공개 매장 API 500 응답의 고정 오류 코드.
 * DB·내부 오류 문구(e.message)는 서버 로그(console.error)에만 남기고 응답에는 이 코드만 싣는다.
 */
export const STORE_PUBLIC_API_ERROR_CODES = {
  homeFeed: "home_feed_failed",
  storeDetail: "store_detail_failed",
  storeSummary: "store_summary_failed",
  /** v4 API-10 — 고객 `app/api/stores/**` 나머지 경로 */
  storeList: "store_list_failed",
  browse: "browse_failed",
  browseFeaturedItems: "browse_featured_items_failed",
  deliveryEta: "delivery_eta_failed",
  deliveryServiceability: "delivery_serviceability_failed",
  inquiries: "store_inquiries_failed",
  menus: "store_menus_failed",
  reviews: "store_reviews_failed",
  reviewsSummary: "store_reviews_summary_failed",
  notices: "store_notices_failed",
  banners: "store_banners_failed",
  favorite: "store_favorite_failed",
  taxonomy: "store_taxonomy_failed",
  productCategories: "store_product_categories_failed",
  productDetail: "store_product_detail_failed",
} as const;

export type StorePublicApiErrorCode =
  (typeof STORE_PUBLIC_API_ERROR_CODES)[keyof typeof STORE_PUBLIC_API_ERROR_CODES];
