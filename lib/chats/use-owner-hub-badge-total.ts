import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import {
  OWNER_HUB_BADGE_EMPTY,
  type OwnerHubBadgeBreakdown,
} from "@/lib/chats/owner-hub-badge-types";
import {
  getOwnerHubBadgeServerSnapshot,
  getOwnerHubBadgeSnapshot,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";
import { resolveBottomNavTradeTabBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { useOwnerLiteHasPreferredStore } from "@/lib/stores/use-owner-lite-store";
import {
  resolveBottomNavMessengerTabBadgeForOwnerStore,
  resolveBottomNavStoresTabBadgeForOwnerStore,
} from "@/lib/stores/owner-store-badge-display-policy";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import { bumpRerenderTrace } from "@/lib/dibay/network-fetch-storm-trace";
import { logHubBadgeRenderTrace } from "@/lib/dibay/shell-fetch-trace";

export type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";

/**
 * 채팅 미읽음·매장(주문·문의) 할 일. 하단 「매장」= storesTabAttention + storeDeepLink.
 */
export function useOwnerHubBadgeBreakdown(): OwnerHubBadgeBreakdown {
  return useSyncExternalStore(subscribeOwnerHubBadge, getOwnerHubBadgeSnapshot, getOwnerHubBadgeServerSnapshot);
}

/** `/stores/owner` 허브 — RSC 시드·단일 Runtime으로 배지를 쓰므로 허브 배지 API 구독 금지 */
export function useOwnerHubBadgeBreakdownWhenEnabled(enabled: boolean): OwnerHubBadgeBreakdown {
  return useSyncExternalStore(
    enabled ? subscribeOwnerHubBadge : () => () => {},
    enabled ? getOwnerHubBadgeSnapshot : () => OWNER_HUB_BADGE_EMPTY,
    getOwnerHubBadgeServerSnapshot
  );
}

/**
 * 채팅 미읽음 + (허브 매장) 주문·문의 할 일 합산.
 */
export function useOwnerHubBadgeTotal(): number {
  const { total } = useOwnerHubBadgeBreakdown();
  return total;
}

function tabUnreadFromBreakdown(
  icon: BottomNavIconKey,
  s: OwnerHubBadgeBreakdown,
  hasOwnerStore: boolean
): number {
  switch (icon) {
    case "chat":
      return resolveBottomNavMessengerTabBadgeForOwnerStore(s, hasOwnerStore);
    case "trade":
      return resolveBottomNavTradeTabBadgeCount(s);
    case "community":
      return s.philifeChatUnread;
    case "stores":
      return resolveBottomNavStoresTabBadgeForOwnerStore(s, hasOwnerStore);
    default:
      return 0;
  }
}

/**
 * 하단 탭 한 칸만 구독 — 배지 API 갱신 시 해당 필드가 바뀐 탭만 리렌더.
 * 숫자 정의는 `samarket-messenger-notification-regulations.ts`.
 *
 * 메신저(`chat`) 탭은 Zustand 와 별도 소스를 쓰지 않고 **허브 스냅샷 단일 경로**만 사용한다.
 * (`applyCommunityMessengerUnreadOptimistic` 가 CM 미읽음 방 개수를 즉시 패치 — 헤더 종과 교차 일치)
 */
export function useOwnerHubBadgeTabUnreadCount(icon: BottomNavIconKey): number {
  const hasOwnerStore = useOwnerLiteHasPreferredStore();
  const readTabUnread = useCallback(
    () => tabUnreadFromBreakdown(icon, getOwnerHubBadgeSnapshot(), hasOwnerStore),
    [icon, hasOwnerStore]
  );
  const raw = useSyncExternalStore(subscribeOwnerHubBadge, readTabUnread, () => 0);
  const lastBumpRef = useRef<{ icon: BottomNavIconKey; n: number } | null>(null);
  useEffect(() => {
    const lb = lastBumpRef.current;
    if (lb && lb.icon === icon && lb.n === raw) return;
    bumpMessengerRenderPerf("messenger_badge_compute");
    bumpRerenderTrace("useOwnerHubBadgeTabUnreadCount", [icon, String(raw)]);
    logHubBadgeRenderTrace([icon, String(raw)]);
    lastBumpRef.current = { icon, n: raw };
  }, [icon, raw]);
  return raw;
}

export function useOwnerHubBadgeStoreDeepLink(): string | null {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    () => getOwnerHubBadgeSnapshot().storeDeepLink,
    () => null
  );
}

