import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
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
