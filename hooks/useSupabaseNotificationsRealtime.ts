"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";

export type SupabaseNotificationsRealtimeOptions = {
  /** true면 신규 알림(INSERT) 시 MP3 재생 */
  playSoundOnInsert?: boolean;
};

function isInsertEvent(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "eventType" in payload &&
    (payload as { eventType?: string }).eventType === "INSERT"
  );
}

function shouldPlaySoundForNotificationInsert(payload: unknown): boolean {
  if (!isInsertEvent(payload)) return false;
  const row = (payload as { new?: { meta?: unknown } }).new;
  if (row && isOwnerStoreCommerceNotificationRow(row)) return false;
  return true;
}

/**
 * Supabase 세션이 있을 때 `public.notifications` INSERT/UPDATE마다 onChange 호출.
 * 앱당 채널 1개(`notifications-rt:${userId}`) — 복수 구독 시 Realtime·워커 부하만 증가.
 */
export function useSupabaseNotificationsRealtime(
  onChange: () => void,
  options?: SupabaseNotificationsRealtimeOptions
) {
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribeForUser = (uid: string) => {
      if (cancelled || !uid) return;
      if (ch) {
        void sb.removeChannel(ch);
        ch = null;
      }
      ch = sb
        .channel(`notifications-rt:${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            if (options?.playSoundOnInsert && shouldPlaySoundForNotificationInsert(payload)) {
              const row = (payload as { new?: { id?: unknown; notification_type?: unknown } }).new;
              const nid = row?.id != null && String(row.id).trim() ? String(row.id).trim() : "";
              const isChat = row?.notification_type === "chat";
              if (isChat && nid) {
                playCoalescedChatNotificationSound(`notif:${nid}`);
              } else {
                playNotificationSound();
              }
            }
            onChange();
          }
        )
        .subscribe();
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        if (ch) {
          void sb.removeChannel(ch);
          ch = null;
        }
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        const uid = session?.user?.id;
        if (uid) subscribeForUser(uid);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
    };
  }, [onChange, options?.playSoundOnInsert]);
}
