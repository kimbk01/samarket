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
} from "@/lib/notifications/notification-badge-count-store";
import { useOwnerNavigationHasPreferredStore } from "@/lib/delivery/owner/projections/use-owner-navigation-summary";
import {
  resolveFabOwnerOrderChatBadgeCount,
  resolveFabOwnerOrdersBadgeCount,
  resolveFabOwnerStoreBadgeCount,
  resolveOwnerOperationsCenterAttentionCount,
} from "@/lib/delivery/owner/owner-store-badge-display-policy";
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

/**
 * Owner FAB / Header selector snapshots — Owner-role axes only.
 *
 * Hub may still emit on Customer/CM/Trade/App Icon axis changes; these getters
 * return the same number so `useSyncExternalStore` skips re-render (Object.is).
 * DO NOT widen to full `OwnerHubBadgeBreakdown` for FAB / `/stores` tier-1 Header.
 */
export function getOwnerFabOrdersBadgeSnapshot(): number {
  return resolveFabOwnerOrdersBadgeCount(getOwnerHubBadgeSnapshot());
}

export function getOwnerFabStoreBadgeSnapshot(): number {
  return resolveFabOwnerStoreBadgeCount(getOwnerHubBadgeSnapshot());
}

export function getOwnerFabOrderChatBadgeSnapshot(): number {
  return resolveFabOwnerOrderChatBadgeCount(getOwnerHubBadgeSnapshot());
}

export function getOwnerHeaderOpsAttentionSnapshot(): number {
  return resolveOwnerOperationsCenterAttentionCount(getOwnerHubBadgeSnapshot());
}

/** FAB 주문내역 — `orderAttention` only */
export function useOwnerFabOrdersBadgeCount(): number {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    getOwnerFabOrdersBadgeSnapshot,
    () => 0
  );
}

/** FAB 스토어 — `inquiryAttention + ownerReviewAttention` */
export function useOwnerFabStoreBadgeCount(): number {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    getOwnerFabStoreBadgeSnapshot,
    () => 0
  );
}

/** FAB 주문채팅 — store-scoped `storeOrderChatUnread` */
export function useOwnerFabOrderChatBadgeCount(): number {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    getOwnerFabOrderChatBadgeSnapshot,
    () => 0
  );
}

/**
 * `/stores` tier-1 Owner Header — operations center attention sum.
 * Reusable by Admin surfaces later; this batch only wires FAB + Stores Header.
 */
export function useOwnerHeaderOpsAttentionCount(): number {
  return useSyncExternalStore(
    subscribeOwnerHubBadge,
    getOwnerHeaderOpsAttentionSnapshot,
    () => 0
  );
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
    case "community":
      return 0;
    case "stores":
      return 0;
    default:
      return 0;
  }
}

/** Legacy feed tabs — BottomNav must not consume notification_events SUM. */
const LEGACY_BOTTOM_NAV_FEED_TAB_ICONS = new Set<BottomNavIconKey>([
  "community",
  "trade",
  "stores",
]);

/**
 * BottomNav events slice lookup — Legacy: feed tabs return null (badge always 0).
 * Chat → hub room count only. App icon total uses badge-count store separately.
 */
export function resolveBottomNavTabUnreadFromNotificationEvents(
  icon: BottomNavIconKey
): number | null {
  if (icon === "chat" || LEGACY_BOTTOM_NAV_FEED_TAB_ICONS.has(icon)) {
    return null;
  }
  const snap = getNotificationBadgeCountSnapshot();
  if (!snap) return null;
  return 0;
}

/**
 * 하단 탭 한 칸만 구독 — Legacy Authority.
 *
 * - chat: Messenger projection unread **room** count (`subscribeMessengerChatTabBadge`)
 * - community / trade / stores: **0** (feed/browse entry — causes in tier1 bell / FAB / chat row)
 */
export function useOwnerHubBadgeTabUnreadCount(icon: BottomNavIconKey): number {
  const hasOwnerStore = useOwnerNavigationHasPreferredStore();
  const hasOwnerStoreRef = useRef(hasOwnerStore);
  hasOwnerStoreRef.current = hasOwnerStore;
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (icon === "chat") {
        return subscribeMessengerChatTabBadge(onStoreChange);
      }
      if (LEGACY_BOTTOM_NAV_FEED_TAB_ICONS.has(icon)) {
        return () => {};
      }
      return subscribeOwnerHubBadge(onStoreChange);
    },
    [icon]
  );
  const getSnapshot = useCallback(() => {
    if (icon === "chat") {
      return resolveMessengerChatTabBadgeCount(hasOwnerStoreRef.current);
    }
    if (LEGACY_BOTTOM_NAV_FEED_TAB_ICONS.has(icon)) {
      return 0;
    }
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
