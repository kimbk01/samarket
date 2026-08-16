/**
 * CONTRACT — 하단 탭·배달 다이얼 상호작용 (제품 3규칙).
 *
 * 1. **모든 일반 하단 탭** (community/trade/delivery/chat/my 등)
 *    → 탭 선택 즉시 `commitMainBottomNavRoute` (history = replace). 이미 동일 URL이면 맨 위 스크롤.
 *    → Chat: `requireAuthAction` gate 후 **동일** `commitMainBottomNavRoute` (bare router.push 금지).
 *    → BottomNav MAIN confirm popup 없음. 데이터 보호는 write/cart/checkout guard.
 *
 * 2. **다이얼 있는 배달 5탭 셸** (`isDeliveryBottomNavRail`)
 *    - **홈 짧은 탭** → 도메인 다이얼 열기/닫기 (`runDeliveryHomeHubShortTap`) — 이동 없음
 *    - **다이얼 칩** → `runDeliveryDialItemNavigation` → `commitMainBottomNavRoute` 즉시 이동
 *
 * 3. **배달 홈 롱프레스** → 해당 도메인 실홈 `/stores` (`runDeliveryHomeHubLongPress`)
 *
 * 4. **Orbit 강조 탭** (domain-hub / messenger-hub)
 *    - 집 아이콘 orbit — `resolveMainBottomNavTabTapHref` 단일 href
 *    - 짧은 탭 → 허브 홈 또는 `/community-messenger?section=chats`
 *    - 이동 커밋 → `commitMainBottomNavRoute` (`onNavigationIntent` 동기)
 *
 * DO NOT: 홈 짧은 탭으로 `/stores` push · 다이얼 칩 Link+preventDefault · tab.href orbit 분기 복제.
 * verify: `npm run verify:delivery-dial-navigation-contract`
 */
export const MAIN_BOTTOM_NAV_INTERACTION_CONTRACT_VERSION = 1 as const;

/** 배달 소비자 5탭 + `DeliveryDomainSwitcherOverlay` 가 붙는 레일 */
export function isMainBottomNavDeliveryDialShell(rail: string): boolean {
  return rail === "stores";
}
