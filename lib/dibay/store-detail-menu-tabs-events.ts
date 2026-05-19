/** 매장 메뉴 탭 앵커 완료 — pin 임계값 재계산용(훅 간 순환 import 방지) */
export const STORE_DETAIL_MENU_TABS_ANCHORED_EVENT = "store-detail-menu-tabs-anchored";

export function notifyStoreDetailMenuTabsAnchored(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STORE_DETAIL_MENU_TABS_ANCHORED_EVENT));
}
