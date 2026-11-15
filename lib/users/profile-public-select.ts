/**
 * `profiles` — 공개 판매자 카드·신뢰 점수 계산에 필요한 컬럼만 (운영에 있는 열만).
 * `temperature` 열은 운영에 없어 조회 전체가 실패했다(운영 Postgres 오류 11-15~16, design-2026-11-16 G2).
 */
export const PROFILE_PUBLIC_MIN_SELECT =
  "id, nickname, username, avatar_url, trust_score, manner_temperature, manner_score";
