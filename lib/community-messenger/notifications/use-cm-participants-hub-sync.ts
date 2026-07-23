"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { applyHubBadgeCmUnreadRoomCountDelta } from "@/lib/chats/owner-hub-badge-store";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { getSupabaseClient } from "@/lib/supabase/client";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";
import {
  getParticipantRoomId,
  getParticipantUnreadCount,
  type MessageNotificationBridgePlayback,
  type ParticipantRealtimeRow,
} from "@/lib/community-messenger/notifications/cm-participant-notification-types";

export type { MessageNotificationBridgePlayback } from "@/lib/community-messenger/notifications/cm-participant-notification-types";

import {
  prefetchRoomSnapshotLazy,
  scheduleParticipantUnreadFullEffects,
} from "@/lib/community-messenger/notifications/cm-participant-hub-sync-lazy";

const MESSAGE_NOTIFICATION_ROOM_BUMP_MIN_GAP_MS = 260;

/**
 * participants Realtime + hub sync (badge·bump·bus) — static graph only.
 * full playback(sound·banner·desktop)는 dynamic import(`cm-participant-unread-full-effects`).
 */
export function useCmParticipantsHubSync(
  enabled = true,
  playback: MessageNotificationBridgePlayback = "full"
): void {
  const { t } = useI18n();
  const tRef = useRef(t);
  const router = useRouter();
  const routerRef = useRef(router);
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  const playbackRef = useRef<MessageNotificationBridgePlayback>(playback);
  const surface = useNotificationSurface();
  const surfaceRef = useRef(surface);
  const visibilityRef = useRef<DocumentVisibilityState>(
    typeof document !== "undefined" ? document.visibilityState : "visible"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const roomBumpLastAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    routerRef.current = router;
    pathnameRef.current = pathname;
    playbackRef.current = playback;
    surfaceRef.current = surface;
    tRef.current = t;
  }, [pathname, playback, router, surface, t]);

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
      if (event === "TOKEN_REFRESHED") return;
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

    let markRealtimeSignal = () => {};
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-unread-sound:${userId}`,
      scope: `community-messenger-unread-sound:${userId}`,
      isCancelled: () => false,
      silentAfterMs: 18_000,
      build: (ch) => {
        return ch.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_participants",
            filter: `user_id=eq.${userId}`,
          },
          (payload: RealtimePostgresChangesPayload<ParticipantRealtimeRow>) => {
            markRealtimeSignal();
            const nextRoomId = getParticipantRoomId((payload.new ?? null) as ParticipantRealtimeRow | null);
            const nextUnread = getParticipantUnreadCount((payload.new ?? null) as ParticipantRealtimeRow | null);
            const prevUnread = getParticipantUnreadCount((payload.old ?? null) as ParticipantRealtimeRow | null);
            if (!nextRoomId) return;
            const key = cmReceiveLatencyKey({ roomId: nextRoomId, messageId: null });
            cmReceiveLatencyMark(key, {
              realtime_event_received_ms: cmReceiveLatencyNow(),
              realtime_payload_room_id: nextRoomId,
              realtime_payload_message_id: "",
              receiver_store_apply_start_ms: cmReceiveLatencyNow(),
            });
            cmReceiveLatencyMark(key, {
              receiver_store_apply_done_ms: cmReceiveLatencyNow(),
              unread_delta_applied_ms: cmReceiveLatencyNow(),
              bottom_badge_updated_ms: cmReceiveLatencyNow(),
              room_list_row_updated_ms: cmReceiveLatencyNow(),
            });
            postCommunityMessengerBusEvent({
              type: "cm.room.summary_patch",
              roomId: nextRoomId,
              viewerUserId: userId,
              unreadCount: nextUnread,
              at: Date.now(),
            });
            if (nextUnread <= prevUnread) {
              requestMessengerHubBadgeResync("participant_unread_changed", {
                roomId: nextRoomId,
                participantUnreadDirection: "decrease",
              });
              return;
            }

            /** 0→>0 room: immediate Hub room-count +1 via projection; resync keeps authority. */
            if (prevUnread === 0 && nextUnread > 0) {
              applyHubBadgeCmUnreadRoomCountDelta(1);
            }
            requestMessengerHubBadgeResync("participant_unread_changed", {
              roomId: nextRoomId,
              participantUnreadDirection: "increase",
            });

            const now = Date.now();
            const roomNorm = nextRoomId.toLowerCase();
            const last = roomBumpLastAtRef.current.get(roomNorm) ?? 0;
            if (now - last >= MESSAGE_NOTIFICATION_ROOM_BUMP_MIN_GAP_MS) {
              roomBumpLastAtRef.current.set(roomNorm, now);
              postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: nextRoomId, at: now });
            }
            prefetchRoomSnapshotLazy(nextRoomId);

            if (playbackRef.current === "hub_sync_only") {
              return;
            }

            scheduleParticipantUnreadFullEffects({
              nextRoomId,
              nextUnread,
              prevUnread,
              latencyKey: key,
              pathnameRef,
              visibilityRef,
              surfaceRef,
              tRef,
              routerRef,
            });
          }
        );
      },
    });
    markRealtimeSignal = sub.markSignal;

    return () => {
      sub.stop();
    };
  }, [enabled, userId]);
}
