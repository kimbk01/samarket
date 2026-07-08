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

/**
 * BottomNav non-Chat events slices (Community / Stores / Trade 조회용).
 * Chat icon → always null (Rebuild: Chat tab must not use event SUM).
 */
export function resolveBottomNavTabUnreadFromNotificationEvents(
  icon: BottomNavIconKey
): number | null {
  const snap = getNotificationBadgeCountSnapshot();
  if (!snap) return null;
  if (icon === "chat") {
    // Rebuild: Chat tab authority is hub room count — never event SUM.
    return null;
  }
  if (icon === "trade") {
    return Math.max(0, (snap.tradeMessage ?? 0) + (snap.tradeStatus ?? snap.trade));
  }
  if (icon === "community") {
    // Philife(community) 탭: community_activity만. admin_notice는 Tier1 종·앱 아이콘 total.
    return Math.max(0, snap.communityActivity ?? 0);
  }
  if (icon === "stores") {
    return Math.max(0, (snap.orderStatus ?? snap.store) + (snap.deliveryStatus ?? 0));
  }
  return 0;
}

/**
 * 하단 탭 한 칸만 구독 — Rebuild Authority.
 *
 * - chat: hub unread **room** count (`subscribeMessengerChatTabBadge`)
 * - trade: events trade_message + trade_status
 * - community / stores: events slice, else hub breakdown
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
        unsubs.push(subscribeNotificationBadgeCount(onStoreChange));
      }
      return () => {
        for (const unsub of unsubs) unsub();
      };
    },
    [icon]
  );
  const getSnapshot = useCallback(() => {
    if (icon === "chat") {
      return resolveMessengerChatTabBadgeCount(hasOwnerStoreRef.current, getOwnerHubBadgeSnapshot());
    }
    if (icon === "trade") {
      return resolveBottomNavTradeTabBadgeCount(getOwnerHubBadgeSnapshot());
    }
    const fromEvents = resolveBottomNavTabUnreadFromNotificationEvents(icon);
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
