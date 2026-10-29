/**
 * 묶음4 F-09 — 고객 공개 매장 API 500 응답의 고정 오류 코드.
 * DB·내부 오류 문구(e.message)는 서버 로그(console.error)에만 남기고 응답에는 이 코드만 싣는다.
 */
export const STORE_PUBLIC_API_ERROR_CODES = {
  homeFeed: "home_feed_failed",
  storeDetail: "store_detail_failed",
  storeSummary: "store_summary_failed",
} as const;

export type StorePublicApiErrorCode =
  (typeof STORE_PUBLIC_API_ERROR_CODES)[keyof typeof STORE_PUBLIC_API_ERROR_CODES];
