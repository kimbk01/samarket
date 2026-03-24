"use client";

import { useCallback } from "react";
import { useSupabaseNotificationsRealtime } from "@/hooks/useSupabaseNotificationsRealtime";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";

/**
 * `notifications` 테이블 Realtime 을 앱당 1회만 구독하고, 배지 스토어가 듣는
 * `KASAMA_NOTIFICATIONS_UPDATED` 로 브로드캐스트합니다.
 * INSERT 시 인앱 알림음은 동일 채널에서 처리(별도 Realtime 구독 없음).
 */
export function NotificationsBadgeRealtimeBridge() {
  const bump = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  useSupabaseNotificationsRealtime(bump, { playSoundOnInsert: true });

  return null;
}
