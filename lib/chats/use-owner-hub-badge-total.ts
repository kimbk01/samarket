import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
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
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";

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

function tabUnreadFromBreakdown(icon: BottomNavIconKey, s: OwnerHubBadgeBreakdown): number {
  switch (icon) {
    case "chat":
      /** 필라이프 헤더 종 아이콘과 동일 — `applyCommunityMessengerUnreadOptimistic` 로 CM 즉시 반영 + 레거시 chatUnread */
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
 *
 * 메신저(`chat`) 탭은 Zustand 와 별도 소스를 쓰지 않고 **허브 스냅샷 단일 경로**만 사용한다.
 * (`applyCommunityMessengerUnreadOptimistic` 가 CM 미읽음 방 개수를 즉시 패치 — 헤더 종과 교차 일치)
 */
export function useOwnerHubBadgeTabUnreadCount(icon: BottomNavIconKey): number {
  const readTabUnread = useCallback(
    () => tabUnreadFromBreakdown(icon, getOwnerHubBadgeSnapshot()),
    [icon]
  );
  const raw = useSyncExternalStore(subscribeOwnerHubBadge, readTabUnread, () => 0);
  const lastBumpRef = useRef<{ icon: BottomNavIconKey; n: number } | null>(null);
  useEffect(() => {
    const lb = lastBumpRef.current;
    if (lb && lb.icon === icon && lb.n === raw) return;
    bumpMessengerRenderPerf("messenger_badge_compute");
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

