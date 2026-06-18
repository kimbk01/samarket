"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  postNotificationMissedCallRead,
  postNotificationRoomRead,
} from "@/lib/notifications/client/notification-event-read-client";

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
 */
export function NotificationRouteReadSync() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const lastRoomKeyRef = useRef<string | null>(null);
  const lastMissedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const cmRoomId = parseCommunityMessengerRoomId(pathname);
    const tradeRoomId = parseTradeChatRoomId(pathname);
    const roomId = cmRoomId ?? tradeRoomId;
    if (!roomId) return;

    const focus = searchParams?.get("focus")?.trim() ?? "";
    const callSessionId = searchParams?.get("callId")?.trim() ?? "";

    if (focus === "call-history") {
      const missedKey = `${roomId}:${callSessionId || "*"}`;
      if (lastMissedKeyRef.current === missedKey) return;
      lastMissedKeyRef.current = missedKey;
      void postNotificationMissedCallRead({
        roomId,
        callSessionId: callSessionId || undefined,
      });
      return;
    }

    const roomKey = `${pathname}:${roomId}`;
    if (lastRoomKeyRef.current === roomKey) return;
    lastRoomKeyRef.current = roomKey;
    void postNotificationRoomRead(roomId);
  }, [pathname, searchParams]);

  return null;
}
