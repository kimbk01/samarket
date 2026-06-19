"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  postNotificationCallLogsMissedCallsRead,
  postNotificationMissedCallRead,
  postNotificationRoomRead,
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
 * 방·통화내역 진입 시 notification_events 읽음 처리 — badge-count SSOT 갱신.
 * 표면 이탈 시 dedupe 키를 초기화해 재진입·신규 미읽음에 다시 읽음 API 가 호출되게 한다.
 */
export function NotificationRouteReadSync() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const lastRoomKeyRef = useRef<string | null>(null);
  const lastMissedKeyRef = useRef<string | null>(null);
  const lastCallLogsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const section = searchParams?.get("section")?.trim() ?? "";
    const onCallLogs = isMessengerCallLogsSurface(pathname, section);

    if (onCallLogs) {
      lastRoomKeyRef.current = null;
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
      lastRoomKeyRef.current = null;
      lastMissedKeyRef.current = null;
      return;
    }

    const focus = searchParams?.get("focus")?.trim() ?? "";
    const callSessionId = searchParams?.get("callId")?.trim() ?? "";

    if (focus === "call-history") {
      lastRoomKeyRef.current = null;
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
    const roomKey = `${pathname}:${roomId}`;
    if (lastRoomKeyRef.current !== roomKey) {
      lastRoomKeyRef.current = roomKey;
      void postNotificationRoomRead(roomId);
    }
  }, [pathname, searchParams]);

  return null;
}
