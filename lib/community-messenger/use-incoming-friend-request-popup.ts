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
          table: "community_friend_requests",
          filter: `addressee_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as { status?: string; id?: string };
          if (row.status !== "pending" || !row.id) return;
          try {
            const res = await fetch("/api/community-messenger/friend-requests", { cache: "no-store" });
            const json = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              requests?: CommunityMessengerFriendRequest[];
            };
            if (!json.ok || !Array.isArray(json.requests)) return;
            const req = json.requests.find((r) => r.id === row.id && r.direction === "incoming");
            if (req) onIncomingRef.current(req);
          } catch {
            // ignore
          }
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, userId]);
}
