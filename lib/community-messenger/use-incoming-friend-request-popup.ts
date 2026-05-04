"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { playIncomingFriendRequestInAppAlert } from "@/lib/community-messenger/incoming-friend-request-inapp-alert";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

function rtStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * `community_friend_requests` INSERT 만 구독 — 팝업 데이터 보강.
 * `notifications` 행은 앱당 1개인 `useSupabaseNotificationsRealtime`(배지 브리지) 가
 * `upsertIncomingFriendRequestPopupFromNotificationInsertRow` 로 이미 반영하므로 여기서는 중복 구독하지 않는다.
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
      name: `messenger:incoming-fr-cfr:${userId}`,
      scope: `messenger:incoming-fr-cfr:${userId}`,
      isCancelled: () => cancelled,
      silentAfterMs: 18_000,
      build: (channel) =>
        channel.on(
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

            const hadId = useIncomingFriendRequestPopupStore.getState().incomingList.some((r) => r.id === id);
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
            if (!hadId) playIncomingFriendRequestInAppAlert(id);
          }
        ),
    });

    return () => {
      cancelled = true;
      currentSub.stop();
    };
  }, [enabled, userId]);
}
