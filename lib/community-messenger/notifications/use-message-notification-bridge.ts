"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  applyCommunityMessengerUnreadOptimistic,
  getOwnerHubBadgeSnapshot,
} from "@/lib/chats/owner-hub-badge-store";
import { documentVisibilityToAppVisibility } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import { resolveParticipantUnreadDeltaInAppEffects } from "@/lib/community-messenger/notifications/messenger-message-notification-policy";
import { tryShowMessengerWebDesktopNotification } from "@/lib/community-messenger/notifications/messenger-web-desktop-notification";
import { useCallStore } from "@/lib/community-messenger/stores/useCallStore";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import {
  messengerRolloutShowsInAppMessageBanner,
  messengerRolloutUsesRoomScrollHints,
  messengerRolloutUsesSurfaceAndVisibilityForSound,
} from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { shouldSuppressMessengerInAppSoundOnTradeExplorationSurface } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { getSupabaseClient } from "@/lib/supabase/client";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import {
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  messengerRoomListSourceFromPathname,
} from "@/lib/community-messenger/messenger-entry-origin";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";

/** `full`: 사운드·배너·데스크톱 알림. `hub_sync_only`: participants Realtime + 허브/뱃지/room bump 만(비메신저 표면). */
export type MessageNotificationBridgePlayback = "full" | "hub_sync_only";

type ParticipantRealtimeRow = {
  room_id?: unknown;
  unread_count?: unknown;
};
const MESSAGE_NOTIFICATION_ROOM_BUMP_MIN_GAP_MS = 260;

function getRoomId(row: ParticipantRealtimeRow | null): string {
  return typeof row?.room_id === "string" ? row.room_id : "";
}

function getUnreadCount(row: ParticipantRealtimeRow | null): number {
  const value = typeof row?.unread_count === "number" ? row.unread_count : Number(row?.unread_count ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function activeCommunityRoomIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function useMessageNotificationBridge(
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

  const navigateToCommunityRoom = (roomId: string) => {
    const pathNow = pathnameRef.current ?? "";
    let fromQs: string | null = null;
    if (typeof window !== "undefined") {
      try {
        fromQs = new URLSearchParams(window.location.search).get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY);
      } catch {
        fromQs = null;
      }
    }
    void runCommunityMessengerRoomForwardNavigation({
      router: routerRef.current,
      roomId,
      listSource: messengerRoomListSourceFromPathname(pathNow),
      fromEntryOrigin: fromQs,
    });
  };

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
      // INITIAL_SESSION 직후에야 세션이 붙는 레이스에서, 첫 syncUser 가 null 이면 구독 effect 가 영구 미실행될 수 있다.
      // TOKEN_REFRESHED 는 동일 user id 가정으로 중복 getUser 왕복만 줄인다.
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
          const nextRoomId = getRoomId((payload.new ?? null) as ParticipantRealtimeRow | null);
          const nextUnread = getUnreadCount((payload.new ?? null) as ParticipantRealtimeRow | null);
          const prevUnread = getUnreadCount((payload.old ?? null) as ParticipantRealtimeRow | null);
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

          /**
           * unread 증가는 “새 메시지 도착”의 강한 신호다.
           * 메시지 테이블 Realtime(publication 누락/세션 레이스 등)이 드물게 끊겨도
           * 방 화면은 `cm.room.bump`로 증분 동기화를 즉시 실행해 새로고침 없이 따라잡는다.
           */
          /**
           * unread 증가: 하단 탭 뱃지를 deferred fetch(2.5s) 이전에 즉시 낙관 패치.
           * 방 **수** 기준 — prevUnread=0→nextUnread>0 일 때만 +1 (메시지 delta 합산 금지).
           * DO NOT: 제거하면 메시지 수신 후 탭 숫자 2.5s 이상 지연.
           */
          {
            const roomCountDelta = prevUnread === 0 && nextUnread > 0 ? 1 : 0;
            const currentCmUnread = getOwnerHubBadgeSnapshot().communityMessengerUnread;
            applyCommunityMessengerUnreadOptimistic(Math.max(0, currentCmUnread) + roomCountDelta);
          }

          const now = Date.now();
          const roomNorm = nextRoomId.toLowerCase();
          const last = roomBumpLastAtRef.current.get(roomNorm) ?? 0;
          if (now - last >= MESSAGE_NOTIFICATION_ROOM_BUMP_MIN_GAP_MS) {
            roomBumpLastAtRef.current.set(roomNorm, now);
            postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: nextRoomId, at: now });
          }
          void prefetchCommunityMessengerRoomSnapshot(nextRoomId, { force: true });

          if (playbackRef.current === "hub_sync_only") {
            requestMessengerHubBadgeResync("participant_unread_changed", {
              roomId: nextRoomId,
              participantUnreadDirection: "increase",
            });
            return;
          }

          if (!messengerRolloutUsesSurfaceAndVisibilityForSound()) {
            const sameRoomPath = pathnameRef.current === `/community-messenger/rooms/${nextRoomId}`;
            const visOk =
              typeof document !== "undefined" && document.visibilityState === "visible";
            const focusOk = typeof document === "undefined" || document.hasFocus();
            if (sameRoomPath && visOk && focusOk) {
              requestMessengerHubBadgeResync("participant_unread_changed", {
                roomId: nextRoomId,
                participantUnreadDirection: "increase",
              });
              return;
            }
            if (!shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(pathnameRef.current)) {
              playCoalescedChatNotificationSound(
                `community-messenger:${nextRoomId}:${prevUnread}->${nextUnread}:${Date.now()}`,
                "community_direct_chat"
              );
            }
            tryShowMessengerWebDesktopNotification({
              roomId: nextRoomId,
              title: tRef.current("notify_messenger_banner_title"),
              body: tRef.current("notify_messenger_new_message_arrived"),
              nextUnread,
              prevUnread,
              activeCommunityRoomId: activeCommunityRoomIdFromPathname(pathnameRef.current),
              appVisibility: documentVisibilityToAppVisibility(visibilityRef.current),
              windowFocused:
                typeof document !== "undefined" ? document.visibilityState === "visible" : true,
              communityChatEnabled: surfaceRef.current?.userNotificationSettings?.community_chat_enabled !== false,
              callStatus: useCallStore.getState().callStatus,
              onNavigateToRoom: navigateToCommunityRoom,
            });
            requestMessengerHubBadgeResync("participant_unread_changed", {
              roomId: nextRoomId,
              participantUnreadDirection: "increase",
            });
            return;
          }

          const sfc = surfaceRef.current;
          const activeRoom = sfc?.activeCommunityChatRoomId ?? null;
          const appVisibility = documentVisibilityToAppVisibility(visibilityRef.current);
          const settings = sfc?.userNotificationSettings;
          const suppressSound = !settings?.sound_enabled || settings?.community_chat_enabled === false;
          const scrollPolicy = messengerRolloutUsesRoomScrollHints();
          const scrollHint = scrollPolicy
            ? useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(nextRoomId)
            : null;

          cmReceiveLatencyMark(key, { notification_decision_ms: cmReceiveLatencyNow() });
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
              windowFocused: sfc?.isWindowFocused ?? true,
            });

          const allowSound =
            playInAppMessageSound &&
            !shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(pathnameRef.current);
          if (dedupeKey && allowSound) {
            cmReceiveLatencyMark(key, { notification_sound_start_ms: cmReceiveLatencyNow() });
            playCoalescedChatNotificationSound(dedupeKey, "community_direct_chat");
          }
          if (messengerRolloutShowsInAppMessageBanner() && dedupeKey && showAppLevelBanner) {
            useMessengerInAppMessageBannerStore.getState().pushOrMerge({
              roomId: nextRoomId,
              title: tRef.current("notify_messenger_banner_title"),
              preview: tRef.current("notify_messenger_new_message_arrived"),
              dedupeKey,
            });
          }
          cmReceiveLatencyMark(key, { push_decision_ms: cmReceiveLatencyNow() });
          tryShowMessengerWebDesktopNotification({
            roomId: nextRoomId,
            title: tRef.current("notify_messenger_banner_title"),
            body: tRef.current("notify_messenger_new_message_arrived"),
            nextUnread,
            prevUnread,
            activeCommunityRoomId: activeRoom,
            appVisibility,
            windowFocused: sfc?.isWindowFocused ?? true,
            communityChatEnabled: settings?.community_chat_enabled !== false,
            callStatus: useCallStore.getState().callStatus,
            onNavigateToRoom: navigateToCommunityRoom,
          });
          requestMessengerHubBadgeResync("participant_unread_changed", {
            roomId: nextRoomId,
            participantUnreadDirection: "increase",
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
