/** 전환 셸이 진입 슬라이드를 이미 수행했는지 — 실제 페이지는 중복 enter 생략 */
let shellDidCoverEnter = false;

export function markStoreDetailShellCoverEnter(): void {
  shellDidCoverEnter = true;
}

export function consumeStoreDetailShellCoveredEnter(): boolean {
  const v = shellDidCoverEnter;
  shellDidCoverEnter = false;
  return v;
}

export function resetStoreDetailNavIntentForTests(): void {
  shellDidCoverEnter = false;
}
