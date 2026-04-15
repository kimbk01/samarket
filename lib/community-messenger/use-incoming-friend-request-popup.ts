"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

/**
 * 수신 친구 요청 INSERT 시(알림 센터와 별도) 하단 팝업으로 승인/거절을 바로 할 수 있게 한다.
 */
export function useIncomingFriendRequestPopup(
  userId: string | null,
  enabled: boolean,
  onIncoming: (request: CommunityMessengerFriendRequest) => void
) {
  const onIncomingRef = useRef(onIncoming);
  const seenRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const channel = sb
      .channel(`messenger:incoming-fr-popup:${userId}`)
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
          const meta = (row.meta ?? null) as Record<string, unknown> | null;
          if (!meta || meta.kind !== "friend_request") return;
          const requestId = typeof meta.request_id === "string" ? meta.request_id.trim() : "";
          if (!requestId) return;
          if (seenRequestIdsRef.current.has(requestId)) return;
          seenRequestIdsRef.current.add(requestId);

          const requesterId = typeof meta.requester_user_id === "string" ? meta.requester_user_id.trim() : "";
          const requesterLabel = typeof meta.requester_label === "string" ? meta.requester_label.trim() : "";
          const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();

          // 알림 payload만으로 즉시 팝업(네트워크 재조회 없이).
          onIncomingRef.current({
            id: requestId,
            requesterId,
            requesterLabel: requesterLabel || "상대",
            addresseeId: userId,
            addresseeLabel: "",
            status: "pending",
            direction: "incoming",
            createdAt,
          });
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, userId]);
}
