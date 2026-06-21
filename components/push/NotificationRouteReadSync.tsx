"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  postNotificationCallLogsMissedCallsRead,
  postNotificationMissedCallRead,
} from "@/lib/notifications/client/notification-event-read-client";
import { isMessengerCallLogsSurface } from "@/lib/notifications/routing/is-messenger-call-logs-surface";

function parseCommunityMessengerRoomId(pathname: string): string | null {
  const m = /^\/community-messenger\/rooms\/([^/?#]+)/.exec(pathname);
  const id = m?.[1] ? decodeURIComponent(m[1]).trim() : "";
  return id || null;
}

function parseTradeChatRoomId(pathname: string): string | null {
  const m = /^\/chats\/([^/?#]+)/.exec(pathname);
  const id = m?.[1] ? decodeURIComponent(m[1]).trim() : "";
  return id || null;
}

/**
 * 통화내역 진입 시 notification_events 읽음 처리 — badge-count SSOT 갱신.
 *
 * CONTRACT: 채팅 room route 진입만으로는 읽음 처리하지 않는다.
 * 채팅 알림 read 는 room bootstrap/messages/viewport ready 이후
 * `useMessengerRoomOpenMarkReadEffect` 의 mark_read 성공 플로우에서만 수행한다.
 */
export function NotificationRouteReadSync() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const lastMissedKeyRef = useRef<string | null>(null);
  const lastCallLogsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const section = searchParams?.get("section")?.trim() ?? "";
    const onCallLogs = isMessengerCallLogsSurface(pathname, section);

    if (onCallLogs) {
      lastMissedKeyRef.current = null;
      const callLogsKey = `${pathname}:${section}`;
      if (lastCallLogsKeyRef.current !== callLogsKey) {
        lastCallLogsKeyRef.current = callLogsKey;
        void postNotificationCallLogsMissedCallsRead();
      }
      return;
    }
    lastCallLogsKeyRef.current = null;

    const cmRoomId = parseCommunityMessengerRoomId(pathname);
    const tradeRoomId = parseTradeChatRoomId(pathname);
    const roomId = cmRoomId ?? tradeRoomId;

    if (!roomId) {
      lastMissedKeyRef.current = null;
      return;
    }

    const focus = searchParams?.get("focus")?.trim() ?? "";
    const callSessionId = searchParams?.get("callId")?.trim() ?? "";

    if (focus === "call-history") {
      const missedKey = `${roomId}:${callSessionId || "*"}`;
      if (lastMissedKeyRef.current !== missedKey) {
        lastMissedKeyRef.current = missedKey;
        void postNotificationMissedCallRead({
          roomId,
          callSessionId: callSessionId || undefined,
        });
      }
      return;
    }

    lastMissedKeyRef.current = null;
    // Chat room notification read is intentionally deferred until the room UI
    // proves that the latest message area is actually visible/readable.
  }, [pathname, searchParams]);

  return null;
}
