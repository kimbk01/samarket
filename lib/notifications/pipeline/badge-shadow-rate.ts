/**
 * 배지 경로 그림자 비교(unread-inputs · bell-single-read) 공통 표본 비율 — 기본 10%, 환경값 0~1.
 * `SAMARKET_BADGE_COUNTER_SHADOW_RATE=0` 이면 모두 끈다.
 *
 * 2026-11-19 재감사 C: 이름의 유래였던 `member_badge_counters` 그림자는 퇴역(입력 표 `member_unread_room_inputs` 가 대체).
 * 비율 함수만 남은 그림자들이 계속 쓴다.
 */
export const MEMBER_BADGE_COUNTER_SHADOW_DEFAULT_RATE = 0.1;

export function resolveMemberBadgeCounterShadowRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.SAMARKET_BADGE_COUNTER_SHADOW_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return MEMBER_BADGE_COUNTER_SHADOW_DEFAULT_RATE;
}
