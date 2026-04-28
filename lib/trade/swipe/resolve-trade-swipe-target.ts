import { getBottomNavAdjacentHref } from "@/lib/main-menu/bottom-nav-config";

export type TradeSwipeDirection = "next" | "prev";

/**
 * 거래 탭 스와이프의 단일 목적지 결정 규칙.
 * - 탭 내부 이동이 가능하면 인접 탭 href
 * - 경계면 하단 메뉴 인접 탭(`home` 기준 prev/next) fallback
 */
export function resolveTradeSwipeTarget(
  tabs: Array<{ href: string }>,
  activeIndex: number,
  direction: TradeSwipeDirection
): string | null {
  if (tabs.length > 0 && activeIndex >= 0) {
    if (direction === "next" && activeIndex < tabs.length - 1) {
      return tabs[activeIndex + 1]?.href ?? null;
    }
    if (direction === "prev" && activeIndex > 0) {
      return tabs[activeIndex - 1]?.href ?? null;
    }
  }
  return getBottomNavAdjacentHref("home", direction);
}

