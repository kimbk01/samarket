import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { DELIVERY_HOME_HUB_HREF } from "@/lib/delivery/delivery-home-hub-navigation";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";

/** 하단 홈 다이얼을 연 레일 — 메신저 칩 `from` 보정에만 사용 */
export type HomeHubDomainDialContext = "delivery" | "trade";

/**
 * CONTRACT — 배달·거래 하단 홈 다이얼 칩 목적지.
 * overlay(`DeliveryDomainSwitcherOverlay`)·prewarm·`runDeliveryDialItemNavigation` 단일 소스.
 * 상호작용·CSS: `delivery-dial-chip-contract.ts` · 검증: `npm run verify:delivery-dial-navigation-contract`
 * DO NOT: `tab.href` 직접 push — `stores`·`chat` 은 레일 컨텍스트 보정이 필요하다.
 */
export function resolveDeliveryDomainDialItemHref(
  tab: BottomNavItemConfig,
  dialContext: HomeHubDomainDialContext = "delivery"
): string {
  switch (tab.id) {
    case "stores":
      return DELIVERY_HOME_HUB_HREF;
    case "chat":
      return mainBottomNavMessengerTabHref(dialContext);
    default:
      return tab.href;
  }
}
