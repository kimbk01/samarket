import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import type { MessengerHubBadgeResyncReason } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { getOwnerHubBadgeSnapshot } from "@/lib/chats/owner-hub-badge-store";
import {
  buildNotificationBadgeProjection,
  EMPTY_BELL_BADGE_FACTS,
  type NotificationBadgeProjectionInput,
} from "@/lib/notifications/build-notification-badge-projection";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import {
  getNotificationBadgeCountSnapshot,
  requestNotificationBadgeCountResync,
} from "@/lib/notifications/notification-badge-count-store";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";

/**
 * notification_events 읽음 mutation 이후 UI 배지 단일 진입점 (Rebuild).
 * Hub room count + Domain badge-count authority resync.
 */
export function resyncBadgesAfterNotificationEventsRead(reason: MessengerHubBadgeResyncReason): void {
  requestMessengerHubBadgeResync(reason);
  requestNotificationBadgeCountResync(reason);
}

function sumEventCategories(bell: NotificationBadgeCount): number {
  return (
    Math.max(0, Math.floor(Number(bell.chatMessage) || 0)) +
    Math.max(0, Math.floor(Number(bell.groupMessage) || 0)) +
    Math.max(0, Math.floor(Number(bell.tradeMessage) || 0)) +
    Math.max(0, Math.floor(Number(bell.tradeStatus) || 0)) +
    Math.max(0, Math.floor(Number(bell.orderStatus) || 0)) +
    Math.max(0, Math.floor(Number(bell.deliveryStatus) || 0)) +
    Math.max(0, Math.floor(Number(bell.communityActivity) || 0)) +
    Math.max(0, Math.floor(Number(bell.adminNotice) || 0)) +
    Math.max(0, Math.floor(Number(bell.missedCall) || 0))
  );
}

/**
 * Bell Contract B optimistic: keep Domain room facts from Hub; patch event inbox only.
 */
function projectionInputFromSurfaces(nextBell: NotificationBadgeCount): NotificationBadgeProjectionInput {
  const hub = getOwnerHubBadgeSnapshot();
  const gdPlusGroup = Math.max(0, Math.floor(Number(hub.communityMessengerUnread) || 0));
  const trade = Math.max(0, Math.floor(Number(hub.chatUnread) || 0));
  const buyer = Math.max(0, Math.floor(Number(hub.buyerOrderAttention) || 0));
  const owner = Math.max(
    0,
    Math.floor(
      Number(hub.storeOrderOwnerUnreadRooms || hub.storeOrderChatUnread) || 0
    )
  );
  const orphan = Math.max(0, Math.floor(Number(nextBell.missedCall) || 0));
  return {
    domainUnreadRooms: {
      general_direct: gdPlusGroup,
      group: 0,
      trade,
      store_order: owner + buyer,
    },
    storeOrderBuyerDeliveryUnread: buyer,
    storeOrderOwnerChatUnread: owner,
    orphanMissedCall: orphan,
    nonChatEventAttention: {
      tradeStatus: Math.max(0, Math.floor(Number(nextBell.tradeStatus) || 0)),
      orderStatus: Math.max(0, Math.floor(Number(nextBell.orderStatus) || 0)),
      deliveryStatus: Math.max(0, Math.floor(Number(nextBell.deliveryStatus) || 0)),
      communityActivity: Math.max(0, Math.floor(Number(nextBell.communityActivity) || 0)),
      adminNotice: Math.max(0, Math.floor(Number(nextBell.adminNotice) || 0)),
    },
    unreadApprovedNotificationEvents: sumEventCategories(nextBell),
    bell: { ...nextBell, total: sumEventCategories(nextBell) },
  };
}

function reapplyProjectionFromInput(
  input: NotificationBadgeProjectionInput,
  sourceHint: string
): boolean {
  void sourceHint;
  const projection = buildNotificationBadgeProjection(input);
  applyNotificationBadgeProjection(projection, {
    applyBell: true,
    projectionVersionMs: Date.now(),
  });
  return true;
}

/**
 * tier1 종 모두 읽음 — adminNotice → 0 then Builder re-run (Bell Contract B).
 */
export function applyTier1InboxMarkAllReadOptimistic(): void {
  const prev = getNotificationBadgeCountSnapshot();
  if (!prev) {
    requestNotificationBadgeCountResync("optimistic_admin_missing_snap");
    return;
  }
  const nextBell: NotificationBadgeCount = {
    ...EMPTY_BELL_BADGE_FACTS,
    ...prev,
    adminNotice: 0,
  };
  reapplyProjectionFromInput(projectionInputFromSurfaces(nextBell), "optimistic_admin");
}

/**
 * Orphan missed_call read — reduce event missedCall (Bell) + App Icon orphan.
 * Room-bound missed must not be subtracted here (already in room attention).
 */
export function applyMissedCallNotificationReadOptimistic(cleared: number): void {
  if (cleared <= 0) return;
  const prev = getNotificationBadgeCountSnapshot();
  if (!prev) {
    requestNotificationBadgeCountResync("optimistic_missed_missing_snap");
    return;
  }
  const nextMissed = Math.max(0, Math.floor(Number(prev.missedCall) || 0) - cleared);
  const nextBell: NotificationBadgeCount = {
    ...EMPTY_BELL_BADGE_FACTS,
    ...prev,
    missedCall: nextMissed,
  };
  reapplyProjectionFromInput(projectionInputFromSurfaces(nextBell), "optimistic_missed");
}
