"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { getSupabaseClient } from "@/lib/supabase/client";

type ParticipantRealtimeRow = {
  room_id?: unknown;
  unread_count?: unknown;
};

function getRoomId(row: ParticipantRealtimeRow | null): string {
  return typeof row?.room_id === "string" ? row.room_id : "";
}

function getUnreadCount(row: ParticipantRealtimeRow | null): number {
  const value = typeof row?.unread_count === "number" ? row.unread_count : Number(row?.unread_count ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function GlobalCommunityMessengerUnreadSound() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentUserIdForDb().then((value) => {
      setUserId(value);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let channel: RealtimeChannel | null = null;
    channel = sb
      .channel(`community-messenger-unread-sound:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_participants",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<ParticipantRealtimeRow>) => {
          const nextRoomId = getRoomId((payload.new ?? null) as ParticipantRealtimeRow | null);
          const nextUnread = getUnreadCount((payload.new ?? null) as ParticipantRealtimeRow | null);
          const prevUnread = getUnreadCount((payload.old ?? null) as ParticipantRealtimeRow | null);
          if (!nextRoomId || nextUnread <= prevUnread) return;
          if (pathname === `/community-messenger/rooms/${nextRoomId}`) return;
          playCoalescedChatNotificationSound(`community-messenger:${nextRoomId}:${nextUnread}`);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(KASAMA_OWNER_HUB_BADGE_REFRESH));
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) void sb.removeChannel(channel);
    };
  }, [pathname, userId]);

  return null;
}
