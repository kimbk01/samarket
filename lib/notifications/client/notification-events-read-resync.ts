import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import type { MessengerHubBadgeResyncReason } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  buildNotificationBadgeProjection,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
  type NotificationBadgeProjectionInput,
} from "@/lib/notifications/build-notification-badge-projection";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import {
  getNotificationBadgeCountSnapshot,
  requestNotificationBadgeCountResync,
} from "@/lib/notifications/notification-badge-count-store";

/**
 * notification_events 읽음 mutation 이후 UI 배지 단일 진입점 (Rebuild).
 * Hub room count + Domain badge-count authority resync.
 */
export function resyncBadgesAfterNotificationEventsRead(reason: MessengerHubBadgeResyncReason): void {
  requestMessengerHubBadgeResync(reason);
  requestNotificationBadgeCountResync(reason);
}

function projectionInputFromBellSnap(): NotificationBadgeProjectionInput | null {
  const prev = getNotificationBadgeCountSnapshot();
  if (!prev) return null;
  return {
    domainUnreadRooms: {
      general_direct: Math.max(0, Math.floor(Number(prev.chatMessage ?? prev.chat) || 0)),
      group: Math.max(0, Math.floor(Number(prev.groupMessage ?? prev.group) || 0)),
      trade: Math.max(0, Math.floor(Number(prev.tradeMessage) || 0)),
      store_order: Math.max(0, Math.floor(Number(prev.store) || 0)),
    },
    orphanMissedCall: Math.max(0, Math.floor(Number(prev.missedCall) || 0)),
    nonChatEventAttention: {
      tradeStatus: Math.max(0, Math.floor(Number(prev.tradeStatus) || 0)),
      orderStatus: Math.max(0, Math.floor(Number(prev.orderStatus) || 0)),
      deliveryStatus: Math.max(0, Math.floor(Number(prev.deliveryStatus) || 0)),
      communityActivity: Math.max(0, Math.floor(Number(prev.communityActivity) || 0)),
      adminNotice: Math.max(0, Math.floor(Number(prev.adminNotice) || 0)),
    },
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
 * tier1 종 모두 읽음 — adminNotice → 0 then Builder re-run (no direct total patch).
 */
export function applyTier1InboxMarkAllReadOptimistic(): void {
  const input = projectionInputFromBellSnap();
  if (!input) {
    requestNotificationBadgeCountResync("optimistic_admin_missing_snap");
    return;
  }
  reapplyProjectionFromInput(
    {
      ...input,
      nonChatEventAttention: {
        ...(input.nonChatEventAttention ?? EMPTY_NON_CHAT_EVENT_ATTENTION),
        adminNotice: 0,
      },
    },
    "optimistic_admin"
  );
}

/**
 * Orphan missed_call read — reduce orphan count in projection input, Builder re-run.
 * Room-bound missed must not be subtracted here (already in room attention).
 */
export function applyMissedCallNotificationReadOptimistic(cleared: number): void {
  if (cleared <= 0) return;
  const input = projectionInputFromBellSnap();
  if (!input) {
    requestNotificationBadgeCountResync("optimistic_missed_missing_snap");
    return;
  }
  const nextOrphan = Math.max(0, Math.floor(Number(input.orphanMissedCall) || 0) - cleared);
  reapplyProjectionFromInput(
    {
      ...input,
      orphanMissedCall: nextOrphan,
    },
    "optimistic_missed"
  );
}
