/**
 * D3 (Owner 승인 2026-11-19) — 모든 회원에게 같은 값인 공개 설정 응답의 CDN 캐시 규칙.
 *
 * - 성공 응답: Vercel CDN 60초 + 만료 뒤 5분간 옛 값을 주면서 뒤에서 1회 갱신.
 *   → DB 조회는 회원 수와 무관하게 경로당 약 1분에 1회. 어드민 변경은 최대 약 1분 뒤 반영.
 *   (운영 실측 2026-11-19: 라우트 Cache-Control 이 next.config `/api/:path*` no-store 보다 우선,
 *    요청에 `Cache-Control: no-cache` 가 붙어도 x-vercel-cache HIT.)
 * - DB 실패로 기본값을 내보낼 때: 캐시 금지 — 기본값이 60초 동안 고정되지 않게.
 * - 이 응답들은 쿠키를 설정하지 않는다(Set-Cookie 가 있으면 CDN 이 캐시하지 않음).
 *
 * 근거: docs/audit/supabase-request-surge-2026-11-18/d2-d3-d9-structure-analysis-2026-11-19.md D3
 */
export const PUBLIC_CONFIG_CDN_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export const PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL = "private, no-store, max-age=0, must-revalidate";
