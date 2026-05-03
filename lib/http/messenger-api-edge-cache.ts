/**
 * 인증된 GET 응답이지만 CDN이 URL·쿠키 단위로 분리 캐시할 수 있도록 하는 헤더.
 * 클라 `fetch(..., { cache: "default" })` 와 함께 쓴다 — `no-store` 는 이 헤더를 무력화한다.
 *
 * @see docs/messenger-production-slo.md — Edge · HTTP 캐시
 */
export const MESSENGER_API_EDGE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=5, stale-while-revalidate=30";

/** 공유 캐시가 세션별로 분리되도록 — 반드시 개인화 응답과 함께 사용 */
export const MESSENGER_API_EDGE_VARY = "Cookie";

export function messengerApiEdgeCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": MESSENGER_API_EDGE_CACHE_CONTROL,
    Vary: MESSENGER_API_EDGE_VARY,
  };
}
