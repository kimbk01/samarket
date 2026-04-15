"use client";

import { useCallback } from "react";
import { useSupabaseNotificationsRealtime } from "@/hooks/useSupabaseNotificationsRealtime";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { isNotificationDomain } from "@/lib/notifications/notification-domains";
import { OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";

/**
 * `notifications` 테이블 Realtime 을 앱당 1회만 구독하고, 배지 스토어가 듣는
 * `KASAMA_NOTIFICATIONS_UPDATED` 로 브로드캐스트합니다.
 * INSERT 시 인앱 알림음은 동일 채널에서 처리(별도 Realtime 구독 없음).
 */
export function NotificationsBadgeRealtimeBridge({ enabled = true }: { enabled?: boolean }) {
  const surface = useNotificationSurface();

  const bump = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  const onInsertSound = useCallback(
    (row: Record<string, unknown>) => {
      const domainRaw = row.domain;
      const refId = typeof row.ref_id === "string" ? row.ref_id : null;
      if (typeof domainRaw === "string" && isNotificationDomain(domainRaw)) {
        const metaAny = row.meta as { kind?: string; room_id?: string } | undefined;
        if (metaAny?.kind === "group_chat" && typeof metaAny.room_id === "string") {
          if (surface && !surface.shouldPlayGroupChatInAppSound(metaAny.room_id)) {
            return false;
          }
          void playDomainNotificationSound(domainRaw);
          return true;
        }
        if (surface && !surface.shouldPlayInAppSound(domainRaw, refId)) {
          return false;
        }
        void playDomainNotificationSound(domainRaw);
        return true;
      }
      const meta = row.meta as { kind?: string; room_id?: string } | undefined;
      if (row.notification_type === "chat" && meta?.kind === "trade_chat" && meta?.room_id) {
        if (surface && !surface.shouldPlayInAppSound("trade_chat", meta.room_id)) {
          return false;
        }
        void playDomainNotificationSound("trade_chat");
        return true;
      }
      if (row.notification_type === "chat" && meta?.kind === "community_chat" && meta?.room_id) {
        if (surface && !surface.shouldPlayInAppSound("community_chat", String(meta.room_id))) {
          return false;
        }
        void playDomainNotificationSound("community_chat");
        return true;
      }
      /** 레거시 commerce 행(domain 컬럼 없음) — 메타 kind 로 매장/주문 도메인 분기 */
      if (row.notification_type === "commerce" && row.meta && typeof row.meta === "object") {
        const m = row.meta as { kind?: string; order_id?: string };
        const oid = typeof m.order_id === "string" ? m.order_id.trim() : "";
        const k = m.kind;
        if (oid && typeof k === "string") {
          const domain = OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(k) ? "store" : "order";
          if (surface && !surface.shouldPlayInAppSound(domain, oid)) {
            return false;
          }
          void playDomainNotificationSound(domain);
          return true;
        }
      }
      return undefined;
    },
    [surface]
  );

  useSupabaseNotificationsRealtime(bump, {
    enabled,
    playSoundOnInsert: true,
    ...(surface ? { onInsertSound } : {}),
  });

  return null;
}
