"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { applyMessengerRoomUnreadFactAndSyncBottom } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { getSupabaseClient } from "@/lib/supabase/client";
import { syncSupabaseRealtimeAuthFromSession } from "@/lib/supabase/wait-for-realtime-auth";
import { applyBootstrapCacheBusEvent } from "@/lib/community-messenger/home/bootstrap-cache-bus-writer";
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
  dismissMessengerInAppBannerForRoom,
  logCmSurfaceSync,
} from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import {
  prefetchRoomSnapshotLazy,
  scheduleParticipantUnreadFullEffects,
} from "@/lib/community-messenger/notifications/cm-participant-hub-sync-lazy";

const MESSAGE_NOTIFICATION_ROOM_BUMP_MIN_GAP_MS = 260;

/**
 * participants Realtime + hub sync (badge·bump·bus·sound·banner) — 같은 턴 동기 반영.
 */
export function useCmParticipantsHubSync(
  enabled = true,
  /** retained for callers / chrome policy; increase sound no longer gated on this */
  _playback: MessageNotificationBridgePlayback = "full"
): void {
  const { t } = useI18n();
  const tRef = useRef(t);
  const router = useRouter();
  const routerRef = useRef(router);
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  const surface = useNotificationSurface();
  const surfaceRef = useRef(surface);
  const visibilityRef = useRef<DocumentVisibilityState>(
    typeof document !== "undefined" ? document.visibilityState : "visible"
  );
  const [userId, setUserId] = useState<string | null>(null);
  const roomBumpLastAtRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    routerRef.current = router;
    pathnameRef.current = pathname;
    surfaceRef.current = surface;
    tRef.current = t;
  }, [pathname, router, surface, t]);

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
    const authUnsub = sb.auth.onAuthStateChange((event) => {
      if (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN") return;
      void syncSupabaseRealtimeAuthFromSession(sb);
    });
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
            const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
            const key = cmReceiveLatencyKey({ roomId: nextRoomId, messageId: null });
            cmReceiveLatencyMark(key, {
              realtime_event_received_ms: cmReceiveLatencyNow(),
              realtime_payload_room_id: nextRoomId,
              realtime_payload_message_id: "",
              receiver_store_apply_start_ms: cmReceiveLatencyNow(),
            });
            /** P0-2: room fact → Projection Authority (no Hub absolute writer). */
            const homeLma = findHomeListRoomRow(peekBootstrapCache(), nextRoomId)?.lastMessageAt;
            const snapLma = peekRoomSnapshot(nextRoomId, userId)?.room?.lastMessageAt;
            const eventVersion = Date.now();
            const applied = applyMessengerRoomUnreadFactAndSyncBottom({
              roomId: nextRoomId,
              viewerUserId: userId,
              unreadCount: nextUnread,
              prevUnreadHint: prevUnread,
              lastMessageAt: homeLma ?? snapLma ?? null,
              versionMs: eventVersion,
              source: "participant_rt",
              authoritySource: "participant_realtime",
              eventIdentity: `participant_rt:${nextRoomId}:${prevUnread}->${nextUnread}:${eventVersion}`,
            });
            const bottom_ms =
              typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
            const summaryPatch = {
              type: "cm.room.summary_patch" as const,
              roomId: nextRoomId,
              viewerUserId: userId,
              unreadCount: applied.unreadCount,
              at: Date.now(),
            };
            postCommunityMessengerBusEvent(summaryPatch);
            /**
             * Bootstrap cache 는 `/community-messenger` layout Host 없이도 갱신한다.
             * (마켓·스토어 등에서 수신 후 메신저 목록 진입 시 행 배지 누락 방지)
             * Host 가 같은 eventId 를 다시 받으면 duplicate skip.
             */
            applyBootstrapCacheBusEvent(summaryPatch, userId, "cm-participants-hub-sync");
            const list_cache_ms =
              typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
            cmReceiveLatencyMark(key, {
              receiver_store_apply_done_ms: cmReceiveLatencyNow(),
              unread_delta_applied_ms: cmReceiveLatencyNow(),
              bottom_badge_updated_ms: cmReceiveLatencyNow(),
              room_list_row_updated_ms: cmReceiveLatencyNow(),
            });
            if (nextUnread <= prevUnread) {
              dismissMessengerInAppBannerForRoom(nextRoomId);
              const banner_ms =
                typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
              logCmSurfaceSync({
                phase: "participant_decrease",
                roomId: nextRoomId,
                t0,
                bottom_ms,
                list_cache_ms,
                sound_schedule_ms: null,
                banner_ms,
                unread: applied.unreadCount,
                prevUnread,
              });
              requestMessengerHubBadgeResync("participant_unread_changed", {
                roomId: nextRoomId,
                participantUnreadDirection: "decrease",
              });
              return;
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

            /**
             * Bottom/list 와 같은 턴에서 sound·banner 동기 schedule.
             * notifications 테이블 INSERT 지연에 의존하지 않는다.
             */
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
            const sound_schedule_ms =
              typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
            logCmSurfaceSync({
              phase: "participant_increase",
              roomId: nextRoomId,
              t0,
              bottom_ms,
              list_cache_ms,
              sound_schedule_ms,
              banner_ms: null,
              unread: applied.unreadCount,
              prevUnread,
            });
          }
        );
      },
    });
    markRealtimeSignal = sub.markSignal;

    return () => {
      try {
        authUnsub.data.subscription.unsubscribe();
      } catch {
        /* ignore */
      }
      sub.stop();
    };
  }, [enabled, userId]);
}
