import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  getOwnerHubBadgeServerSnapshot,
  getOwnerHubBadgeSnapshot,
  refreshOwnerHubBadgeIfHubPath,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";

export type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";

/**
 * 채팅 미읽음·매장(주문·문의) 할 일. 하단 「매장」= storesTabAttention + storeDeepLink.
 */
export function useOwnerHubBadgeBreakdown(): OwnerHubBadgeBreakdown {
  const pathname = usePathname();
  const state = useSyncExternalStore(
    subscribeOwnerHubBadge,
    getOwnerHubBadgeSnapshot,
    getOwnerHubBadgeServerSnapshot
  );

  useEffect(() => {
    refreshOwnerHubBadgeIfHubPath(pathname ?? null);
  }, [pathname]);

  return state;
}

/**
 * 채팅 미읽음 + (허브 매장) 주문·문의 할 일 합산.
 */
export function useOwnerHubBadgeTotal(): number {
  const { total } = useOwnerHubBadgeBreakdown();
  return total;
}

function tabUnreadFromSnapshot(icon: BottomNavIconKey): number {
  const s = getOwnerHubBadgeSnapshot();
  switch (icon) {
    case "chat":
      return s.communityMessengerUnread;
    case "trade":
      return s.chatUnread;
    case "community":
      return s.philifeChatUnread;
    case "stores":
      return s.storesTabAttention;
    default:
      return 0;
  }
}

/**
 * 하단 탭 한 칸만 구독 — 배지 API 갱신 시 해당 필드가 바뀐 탭만 리렌더(전체 네비 리렌더 방지).
 */
export function useOwnerHubBadgeTabUnreadCount(icon: BottomNavIconKey): number {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    () => tabUnreadFromSnapshot(icon),
    () => 0
  );
}

export function useOwnerHubBadgeStoreDeepLink(): string | null {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    () => getOwnerHubBadgeSnapshot().storeDeepLink,
    () => null
  );
}
