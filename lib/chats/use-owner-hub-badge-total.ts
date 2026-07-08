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
import {
  resolveMessengerChatTabBadgeCount,
  subscribeMessengerChatTabBadge,
} from "@/lib/notifications/messenger-chat-tab-badge";
import {
  getNotificationBadgeCountSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";
import { resolveBottomNavTradeTabBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { useOwnerLiteHasPreferredStore } from "@/lib/stores/use-owner-lite-store";
import {
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
      return resolveMessengerChatTabBadgeCount(hasOwnerStore, s);
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

function tabUnreadFromNotificationEvents(icon: BottomNavIconKey): number | null {
  return resolveBottomNavTabUnreadFromNotificationEvents(icon);
}

/** P0.1 — BottomNav 탭별 notification_events 슬라이스 (테스트·계약용 export) */
export function resolveBottomNavTabUnreadFromNotificationEvents(
  icon: BottomNavIconKey
): number | null {
  const snap = getNotificationBadgeCountSnapshot();
  if (!snap) return null;
  if (icon === "chat") {
    return Math.max(0, (snap.chatMessage ?? snap.chat) + (snap.groupMessage ?? snap.group));
  }
  if (icon === "trade") {
    return Math.max(0, (snap.tradeMessage ?? 0) + (snap.tradeStatus ?? snap.trade));
  }
  if (icon === "community") {
    // P0.1 — Philife(community) 탭: community_activity만. admin_notice는 Tier1 종·앱 아이콘 total.
    return Math.max(0, snap.communityActivity ?? 0);
  }
  if (icon === "stores") {
    return Math.max(0, (snap.orderStatus ?? snap.store) + (snap.deliveryStatus ?? 0));
  }
  return 0;
}

/**
 * 하단 탭 한 칸만 구독 — 배지 API 갱신 시 해당 필드가 바뀐 탭만 리렌더.
 * 숫자 정의는 `samarket-messenger-notification-regulations.ts`.
 *
 * 메신저(`chat`) 탭: `notification_events` SSOT + owner-hub 폴백 — `subscribeMessengerChatTabBadge`.
 */
export function useOwnerHubBadgeTabUnreadCount(icon: BottomNavIconKey): number {
  const hasOwnerStore = useOwnerLiteHasPreferredStore();
  const hasOwnerStoreRef = useRef(hasOwnerStore);
  hasOwnerStoreRef.current = hasOwnerStore;
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubs: Array<() => void> = [];
      if (icon === "chat") {
        unsubs.push(subscribeMessengerChatTabBadge(onStoreChange));
      } else {
        unsubs.push(subscribeOwnerHubBadge(onStoreChange));
      }
      unsubs.push(subscribeNotificationBadgeCount(onStoreChange));
      return () => {
        for (const unsub of unsubs) unsub();
      };
    },
    [icon]
  );
  const getSnapshot = useCallback(() => {
    if (icon === "trade") {
      return resolveBottomNavTradeTabBadgeCount(getOwnerHubBadgeSnapshot());
    }
    const fromEvents = tabUnreadFromNotificationEvents(icon);
    if (fromEvents != null) return fromEvents;
    const hub = getOwnerHubBadgeSnapshot();
    return tabUnreadFromBreakdown(icon, hub, hasOwnerStoreRef.current);
  }, [icon]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const lastBumpRef = useRef<{ icon: BottomNavIconKey; n: number } | null>(null);
  const traceComponent = `useOwnerHubBadgeTabUnreadCount:${icon}`;
  useEffect(() => {
    const lb = lastBumpRef.current;
    if (lb && lb.icon === icon && lb.n === raw) return;
    bumpMessengerRenderPerf("messenger_badge_compute");
    bumpRerenderTrace(traceComponent, [String(raw)]);
    logHubBadgeRenderTrace([icon, String(raw)]);
    lastBumpRef.current = { icon, n: raw };
  }, [icon, raw, traceComponent]);
  return raw;
}

export function useOwnerHubBadgeStoreDeepLink(): string | null {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    () => getOwnerHubBadgeSnapshot().storeDeepLink,
    () => null
  );
}
