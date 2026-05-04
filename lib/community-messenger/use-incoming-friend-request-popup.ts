"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { upsertIncomingFriendRequestPopupFromNotificationInsertRow } from "@/lib/community-messenger/incoming-friend-request-popup-from-notification-row";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

function rtStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * 수신 친구 요청 팝업 스토어 갱신.
 * - `notifications` INSERT — 서버가 넣는 인앱 알림 행(meta.kind=friend_request). `IncomingFriendRequestPopupFromNotificationRow` 와 동일 파싱.
 * - `community_friend_requests` INSERT — 알림 행이 없거나 지연될 때 DB 행만으로 표시. 통화 화면 등 알림 브리지가 꺼진 경우에 필요.
 *
 * `useSupabaseNotificationsRealtime` 도 같은 notifications 행으로 스토어를 올릴 수 있어 중복 upsert 는 id 기준으로 무해하다.
 */
export function useIncomingFriendRequestPopup(
  userId: string | null,
  enabled: boolean,
  onIncoming: (request: CommunityMessengerFriendRequest) => void
) {
  const onIncomingRef = useRef(onIncoming);

  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;

    const emit = (req: CommunityMessengerFriendRequest) => onIncomingRef.current(req);

    const currentSub = subscribeWithRetry({
      sb,
      name: `messenger:incoming-fr-unified:${userId}`,
      scope: `messenger:incoming-fr-unified:${userId}`,
      isCancelled: () => cancelled,
      silentAfterMs: 18_000,
      build: (channel) =>
        channel
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const row = (payload as { new?: Record<string, unknown> }).new ?? {};
              upsertIncomingFriendRequestPopupFromNotificationInsertRow(row);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_friend_requests",
              filter: `addressee_id=eq.${userId}`,
            },
            (payload) => {
              const row = (payload as { new?: Record<string, unknown> }).new ?? {};
              const id = rtStr(row.id);
              const status = rtStr(row.status);
              const requesterId = rtStr(row.requester_id);
              const addresseeId = rtStr(row.addressee_id);
              const createdAt =
                typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
              if (!id || status !== "pending" || addresseeId !== userId || !requesterId) return;

              emit({
                id,
                requesterId,
                requesterLabel: "",
                addresseeId,
                addresseeLabel: "",
                status: "pending",
                direction: "incoming",
                createdAt,
              });
            }
          ),
    });

    return () => {
      cancelled = true;
      currentSub.stop();
    };
  }, [enabled, userId]);
}
