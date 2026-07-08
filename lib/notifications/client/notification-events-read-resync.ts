import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import type { MessengerHubBadgeResyncReason } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import {
  getNotificationBadgeCountSnapshot,
  patchNotificationBadgeCountSnapshot,
} from "@/lib/notifications/notification-badge-count-store";

/**
 * notification_events 읽음 mutation 이후 UI 배지 단일 진입점 (Rebuild).
 * `requestMessengerHubBadgeResync` → hub (Chat room count) + `requestNotificationBadgeCountResync`
 * (App icon total). categoryCounts 유무와 무관하게 호출해야 한다.
 */
export function resyncBadgesAfterNotificationEventsRead(reason: MessengerHubBadgeResyncReason): void {
  requestMessengerHubBadgeResync(reason);
}

/** 서버 응답 `cleared` 를 반영해 missedCall 뱃지를 즉시 내린 뒤 서버와 재정합 */
export function applyMissedCallNotificationReadOptimistic(cleared: number): void {
  if (cleared <= 0) return;
  const prev = getNotificationBadgeCountSnapshot();
  if (!prev) return;
  const missedCall = Math.max(0, prev.missedCall - cleared);
  const next: NotificationBadgeCount = {
    ...prev,
    missedCall,
    total:
      (prev.chatMessage ?? prev.chat) +
      (prev.groupMessage ?? prev.group) +
      (prev.tradeMessage ?? 0) +
      (prev.tradeStatus ?? prev.trade) +
      (prev.orderStatus ?? prev.store) +
      (prev.deliveryStatus ?? 0) +
      (prev.communityActivity ?? 0) +
      (prev.adminNotice ?? 0) +
      missedCall,
  };
  if (next.missedCall === prev.missedCall && next.total === prev.total) return;
  patchNotificationBadgeCountSnapshot(next);
}
