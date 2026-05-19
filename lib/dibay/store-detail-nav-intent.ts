/** 전환 셸이 진입 슬라이드를 이미 수행했는지 — 실제 페이지는 중복 enter 생략 */
let shellDidCoverEnter = false;

/** 매장 메뉴 루트 도착 시 탭 바가 보이도록 스크롤(모든 진입·뒤로 동일) */
let menuTabsLandingPending = false;

export function markStoreDetailShellCoverEnter(): void {
  shellDidCoverEnter = true;
}

export function consumeStoreDetailShellCoveredEnter(): boolean {
  const v = shellDidCoverEnter;
  shellDidCoverEnter = false;
  return v;
}

export function markStoreDetailMenuTabsLanding(): void {
  menuTabsLandingPending = true;
}

export function consumeStoreDetailMenuTabsLanding(): boolean {
  const v = menuTabsLandingPending;
  menuTabsLandingPending = false;
  return v;
}

export function resetStoreDetailNavIntentForTests(): void {
  shellDidCoverEnter = false;
  menuTabsLandingPending = false;
}
