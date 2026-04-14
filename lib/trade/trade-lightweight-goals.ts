/**
 * 거래(Trade) 영역의 성능·유지보수 목표 — **가볍게**가 1순위.
 * 상세 원칙·실천 표는 `docs/trade-lightweight-design.md` 와 동기화한다.
 *
 * 상용 빌더에서 오래 쌓인 코드·중복 요청·큰 번들이 합쳐지면 체감 속도와 운영 비용이 함께 악화되므로,
 * 새 기능·리뷰 시 아래 네 축을 벗어나지 않도록 한다.
 * (체감 속도·예측 가능한 데이터 경로·감사·장애 추적 가능성은 “기능 개수”보다 우선한다.)
 */
export const TRADE_LIGHTWEIGHT_GOALS = {
  /** 페이지·라우트당 JS 최소화 — RSC, 클라이언트 섬, 지연 로드 */
  reduceJsPerPage: "페이지당 JS 줄이기",
  /** 동일 화면에서 서버 단일 페이로드·단일 왕복 우선 (클라는 prime·TTL·single-flight로 재요청 완화) */
  fetchOnceOnServer: "서버에서 데이터 한 번에 가져오기",
  /** URL·서버 응답을 진실로, 목록 복제·과도한 useState 지양 */
  minimizeClientState: "불필요한 클라이언트 상태 줄이기",
  /** 쿼리 단순화·N+1 제거·HTTP·앱·DB 캐시 계층 정리 */
  simplifyQueryAndCache: "쿼리 단순화·캐싱",
} as const;

export type TradeLightweightGoalLabel =
  (typeof TRADE_LIGHTWEIGHT_GOALS)[keyof typeof TRADE_LIGHTWEIGHT_GOALS];
