import { useSyncExternalStore } from "react";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  getOwnerHubBadgeServerSnapshot,
  getOwnerHubBadgeSnapshot,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";
import {
  resolveBottomNavTradeTabBadgeCount,
  resolveMessengerTabTotalUnreadBadgeCount,
} from "@/lib/notifications/samarket-messenger-notification-regulations";

export type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";

/**
 * 채팅 미읽음·매장(주문·문의) 할 일. 하단 「매장」= storesTabAttention + storeDeepLink.
 */
export function useOwnerHubBadgeBreakdown(): OwnerHubBadgeBreakdown {
  return useSyncExternalStore(subscribeOwnerHubBadge, getOwnerHubBadgeSnapshot, getOwnerHubBadgeServerSnapshot);
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
      return resolveMessengerTabTotalUnreadBadgeCount(s);
    case "trade":
      return resolveBottomNavTradeTabBadgeCount(s);
    case "community":
      return s.philifeChatUnread;
    case "stores":
      return s.storesTabAttention;
    default:
      return 0;
  }
}

/**
 * 하단 탭 한 칸만 구독 — 배지 API 갱신 시 해당 필드가 바뀐 탭만 리렌더.
 * 숫자 정의는 `samarket-messenger-notification-regulations.ts`.
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

