import { DIBAY_SERVICE_BRAND, type DibayServiceBrandId } from "../brand/dibay-service-brand";

/**
 * 한국어 화면 서비스 표시명 — LOUNGE 안 3개(FEED·MARKET·CREW)만 한글 (Owner 2026-11-14 「정보 공유, 마켓, 모임부분을 정확히 한글 표기
 * 영문시 지금처럼」). 영어 화면은 `DIBAY_SERVICE_BRAND` 그대로. 카탈로그 ko 블록만 이 값을 쓴다.
 */
export const DIBAY_SERVICE_BRAND_KO = {
  ...DIBAY_SERVICE_BRAND,
  FEED: "정보 공유",
  MARKET: "마켓",
  CREW: "모임",
} as const satisfies Record<DibayServiceBrandId, string>;
