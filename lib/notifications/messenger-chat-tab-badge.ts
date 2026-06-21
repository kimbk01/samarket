/**
 * 하단 메신저(chat) 탭 뱃지 — notification_events SSOT + owner-hub 초기 폴백.
 *
 * `tabUnreadFromBreakdown` 이 events 스냅샷을 읽기만 하고 구독하지 않던 구조적 결함을
 * composite subscribe 로 한 경로에 묶는다.
 * events snapshot 이 한 번이라도 있으면 hub 값은 primary badge 를 덮지 못한다.
 */
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  getOwnerHubBadgeSnapshot,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";
import {
  getNotificationBadgeCountSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";
import { resolveBottomNavMessengerTabBadgeForOwnerStore } from "@/lib/stores/owner-store-badge-display-policy";

export function resolveMessengerChatTabBadgeCount(
  hasOwnerStore: boolean,
  hub: OwnerHubBadgeBreakdown = getOwnerHubBadgeSnapshot()
): number {
  const eventsSnap = getNotificationBadgeCountSnapshot();
  const chatUnread =
    eventsSnap != null
      ? Math.max(0, (eventsSnap.chatMessage ?? eventsSnap.chat) + (eventsSnap.groupMessage ?? eventsSnap.group))
      : null;
  const breakdown =
    chatUnread != null
      ? { ...hub, communityMessengerUnread: chatUnread }
      : hub;
  return resolveBottomNavMessengerTabBadgeForOwnerStore(breakdown, hasOwnerStore);
}

/** hub 배지·notification_events 배지 중 어느 쪽이든 갱신되면 notify */
export function subscribeMessengerChatTabBadge(onStoreChange: () => void): () => void {
  const unsubHub = subscribeOwnerHubBadge(onStoreChange);
  const unsubEvents = subscribeNotificationBadgeCount(onStoreChange);
  return () => {
    unsubHub();
    unsubEvents();
  };
}
