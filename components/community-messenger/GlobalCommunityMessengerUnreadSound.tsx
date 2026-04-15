"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { documentVisibilityToAppVisibility } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import {
  resolveParticipantUnreadDeltaInAppEffects,
} from "@/lib/community-messenger/notifications/messenger-message-notification-policy";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import {
  messengerRolloutShowsInAppMessageBanner,
  messengerRolloutUsesRoomScrollHints,
  messengerRolloutUsesSurfaceAndVisibilityForSound,
} from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
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

export function GlobalCommunityMessengerUnreadSound({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  const surface = useNotificationSurface();
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const visibilityRef = useRef<DocumentVisibilityState>(
    typeof document !== "undefined" ? document.visibilityState : "visible"
  );
  const [userId, setUserId] = useState<string | null>(null);

  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      visibilityRef.current = document.visibilityState;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const syncUser = () => {
      void getCurrentUserIdForDb().then((id) => setUserId((prev) => (prev === id ? prev : id)));
    };
    syncUser();
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      syncUser();
    });
    return () => {
      authSub?.data.subscription.unsubscribe();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onTestAuth = () => {
      void getCurrentUserIdForDb().then((id) => setUserId((prev) => (prev === id ? prev : id)));
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
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

          /** 0단계: URL 경로만 — 임베드 시트 방 ID 미반영 */
          if (!messengerRolloutUsesSurfaceAndVisibilityForSound()) {
            if (pathnameRef.current === `/community-messenger/rooms/${nextRoomId}`) return;
            playCoalescedChatNotificationSound(`community-messenger:${nextRoomId}:${nextUnread}`);
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent(KASAMA_OWNER_HUB_BADGE_REFRESH));
            }
            return;
          }

          const sfc = surfaceRef.current;
          const activeRoom = sfc?.activeCommunityChatRoomId ?? null;
          const appVisibility = documentVisibilityToAppVisibility(visibilityRef.current);
          const settings = sfc?.userNotificationSettings;
          const suppressSound =
            !settings?.sound_enabled ||
            settings?.community_chat_enabled === false;

          const scrollPolicy = messengerRolloutUsesRoomScrollHints();
          const scrollHint = scrollPolicy
            ? useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(nextRoomId)
            : null;

          const { playInAppMessageSound, showAppLevelBanner, dedupeKey } =
            resolveParticipantUnreadDeltaInAppEffects({
              targetRoomId: nextRoomId,
              nextUnread,
              prevUnread,
              activeCommunityRoomId: activeRoom,
              appVisibility,
              suppressInAppMessageSound: suppressSound,
              sameRoomScrollHint: scrollHint,
              applySameRoomScrollPolicy: scrollPolicy,
            });

          if (dedupeKey && playInAppMessageSound) {
            playCoalescedChatNotificationSound(dedupeKey);
          }
          if (messengerRolloutShowsInAppMessageBanner() && dedupeKey && showAppLevelBanner) {
            useMessengerInAppMessageBannerStore.getState().pushOrMerge({
              roomId: nextRoomId,
              title: "메신저",
              preview: "새 메시지가 도착했습니다",
              dedupeKey,
            });
          }
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(KASAMA_OWNER_HUB_BADGE_REFRESH));
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) void sb.removeChannel(channel);
    };
  }, [enabled, userId]);

  return null;
}
