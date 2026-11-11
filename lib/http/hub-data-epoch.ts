/**
 * D1 §4 허브 데이터 세대(epoch) — 서버·클라이언트 어디서 import 해도 안전한 순수 모듈.
 * 세대가 오르면 허브 화면 보관대의 60초 규칙(`lib/http/hub-data-freshness.ts`)이 모두 무효가 되어 다음 효과에서 다시 받는다.
 * 데이터를 바꾸는 쪽(글 쓰기·삭제·프로필 변경·피드 캐시 비우기·당겨서 새로고침)은 기존 캐시 무효화 함수에서 함께 올린다.
 */
/** 허브 데이터 다시 받기 기준 시간 (설계서 §4 · 단일 값) */
export const HUB_DATA_REVISIT_FRESH_MS = 60_000;

let hubDataEpoch = 0;

export function peekHubDataEpoch(): number {
  return hubDataEpoch;
}

export function invalidateAllHubData(_reason: string): void {
  hubDataEpoch += 1;
}
