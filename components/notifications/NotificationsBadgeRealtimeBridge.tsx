"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSupabaseNotificationsRealtime } from "@/hooks/useSupabaseNotificationsRealtime";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { routeNotificationInsertSound } from "@/lib/notifications/notification-sound-gate";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";
import { applyOwnerCommerceNotificationInvalidate } from "@/lib/delivery/owner/apply-owner-commerce-notification-invalidate";

/** Realtime UPDATE burst — unread 배지 CustomEvent trailing 1회 */
const NOTIFICATIONS_RT_BADGE_COALESCE_MS = 1_200;
/** owner hub — INSERT(신규 알림)만, 5s 갭과 정렬 */
const NOTIFICATIONS_RT_HUB_DEDUPE_MS = 5_000;

/**
 * `notifications` + `notification_events` 테이블 Realtime 을 앱당 1회만 구독하고, 배지 스토어가 듣는
 * `KASAMA_NOTIFICATIONS_UPDATED` 로 브로드캐스트합니다.
 * Phase J2a: legacy surface unread badge poll refresh 제거 — Domain Bell은 badge-count / resync 경로.
 * INSERT 시 인앱 알림음은 동일 채널에서 처리(별도 Realtime 구독 없음).
 */
export function NotificationsBadgeRealtimeBridge({ enabled = true }: { enabled?: boolean }) {
  const coalescedBadgeBumpRef = useRef<ReturnType<typeof createTrailingCoalescedCallback> | null>(null);

  useEffect(() => {
    coalescedBadgeBumpRef.current = createTrailingCoalescedCallback(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
      }
    }, NOTIFICATIONS_RT_BADGE_COALESCE_MS);
    return () => {
      coalescedBadgeBumpRef.current?.cancel();
      coalescedBadgeBumpRef.current = null;
    };
  }, []);

  const bump = useCallback(({ eventType }: { eventType: string }) => {
    if (eventType === "INSERT") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
      }
    } else {
      coalescedBadgeBumpRef.current?.schedule();
    }
    /**
     * 거래/주문/문의 **신규** 알림 INSERT만 owner hub 배지 갱신.
     * UPDATE burst(읽음 일괄)는 list coalesce 로 충분 — hub cmFresh 연쇄 방지.
     */
    if (eventType === "INSERT") {
      dispatchOwnerHubBadgeRefresh({
        source: "notifications-realtime",
        key: "notifications-insert",
        dedupeMs: NOTIFICATIONS_RT_HUB_DEDUPE_MS,
      });
    }
  }, []);

  const onInsertSound = useCallback((row: Record<string, unknown>) => {
    const meta =
      row.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, unknown>)
        : null;
    applyOwnerCommerceNotificationInvalidate({
      ownerUserId: String(row.user_id ?? "").trim(),
      meta,
      route: "NotificationsBadgeRealtimeBridge",
      reason: "owner_commerce_notification_insert",
    });
    return routeNotificationInsertSound(row);
  }, []);

  useSupabaseNotificationsRealtime(bump, {
    enabled,
    playSoundOnInsert: true,
    onInsertSound,
  });

  return null;
}
