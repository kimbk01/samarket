/** 어드민 목록·집계 GET — remount·탭 복귀 시 재조회 완화 TTL */
export const ADMIN_QUERY_TTL_MS = 30_000;

/** 실시간성이 높은 주문·배달 보드 */
export const ADMIN_QUERY_TTL_FAST_MS = 10_000;

/** 대시보드·벨 등 짧은 합류 윈도우 */
export const ADMIN_QUERY_TTL_SHORT_MS = 5_000;
