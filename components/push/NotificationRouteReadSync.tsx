"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CAMPAIGN_PUSH_OPEN_PARAM, isCampaignOccurrenceId } from "@/lib/notifications/campaign-push-open-param";
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
  const router = useRouter();
  const lastPushOpenRef = useRef<string | null>(null);

  /**
   * 푸시 전용 알림 열람 (push-only-open-tracking-design-2026-11-02 · Owner 승인 2026-11-02) — 목적지 주소의
   * `notif_open=<회차 id>` 를 서버에 1번 알리고 주소에서 지운다(화면·스크롤 그대로). 실패해도 화면 이동과 무관.
   */
  useEffect(() => {
    const occ = searchParams?.get(CAMPAIGN_PUSH_OPEN_PARAM)?.trim() ?? "";
    if (!occ) return;
    if (isCampaignOccurrenceId(occ) && lastPushOpenRef.current !== occ) {
      lastPushOpenRef.current = occ;
      void fetch("/api/me/notifications/campaign-push-opened", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurrence_id: occ }),
      }).catch(() => undefined);
    }
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete(CAMPAIGN_PUSH_OPEN_PARAM);
    const qs = next.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
  }, [pathname, searchParams, router]);
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
