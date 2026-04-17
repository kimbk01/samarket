"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
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
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { applyRoomSummaryPatched } from "@/lib/community-messenger/stores/messenger-realtime-store";

/** `full`: 사운드·배너·데스크톱 알림. `hub_sync_only`: participants Realtime + 허브/뱃지/room bump 만(비메신저 표면). */
export type MessageNotificationBridgePlayback = "full" | "hub_sync_only";

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

function activeCommunityRoomIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function useMessageNotificationBridge(
  enabled = true,
  playback: MessageNotificationBridgePlayback = "full"
): void {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  pathnameRef.current = pathname;
  const playbackRef = useRef<MessageNotificationBridgePlayback>(playback);
  playbackRef.current = playback;
  const surface = useNotificationSurface();
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const visibilityRef = useRef<DocumentVisibilityState>(
    typeof document !== "undefined" ? document.visibilityState : "visible"
  );
  const [userId, setUserId] = useState<string | null>(null);

  const navigateToCommunityRoom = useCallback((roomId: string) => {
    const id = String(roomId ?? "").trim();
    if (!id) return;
    routerRef.current.push(`/community-messenger/rooms/${encodeURIComponent(id)}`);
  }, []);

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
          if (!nextRoomId) return;
          applyRoomSummaryPatched({
            viewerUserId: userId,
            roomId: nextRoomId,
            unreadCount: nextUnread,
          });
          postCommunityMessengerBusEvent({
            type: "cm.room.summary_patch",
            roomId: nextRoomId,
            viewerUserId: userId,
            unreadCount: nextUnread,
            at: Date.now(),
          });
          if (nextUnread <= prevUnread) {
            requestMessengerHubBadgeResync("participant_unread_changed");
            return;
          }

          /**
           * unread 증가는 “새 메시지 도착”의 강한 신호다.
           * 메시지 테이블 Realtime(publication 누락/세션 레이스 등)이 드물게 끊겨도
           * 방 화면은 `cm.room.bump`로 증분 동기화를 즉시 실행해 새로고침 없이 따라잡는다.
           */
          postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: nextRoomId, at: Date.now() });
          void prefetchCommunityMessengerRoomSnapshot(nextRoomId, { force: true });

          if (playbackRef.current === "hub_sync_only") {
            requestMessengerHubBadgeResync("participant_unread_changed");
            return;
          }

          if (!messengerRolloutUsesSurfaceAndVisibilityForSound()) {
            const sameRoomPath = pathnameRef.current === `/community-messenger/rooms/${nextRoomId}`;
            const visOk =
              typeof document !== "undefined" && document.visibilityState === "visible";
            const focusOk = typeof document === "undefined" || document.hasFocus();
            if (sameRoomPath && visOk && focusOk) {
              requestMessengerHubBadgeResync("participant_unread_changed");
              return;
            }
            if (!shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(pathnameRef.current)) {
              playCoalescedChatNotificationSound(`community-messenger:${nextRoomId}:${nextUnread}`, "community_direct_chat");
            }
            tryShowMessengerWebDesktopNotification({
              roomId: nextRoomId,
              title: "메신저",
              body: "새 메시지가 도착했습니다",
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
            requestMessengerHubBadgeResync("participant_unread_changed");
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
            playCoalescedChatNotificationSound(dedupeKey, "community_direct_chat");
          }
          if (messengerRolloutShowsInAppMessageBanner() && dedupeKey && showAppLevelBanner) {
            useMessengerInAppMessageBannerStore.getState().pushOrMerge({
              roomId: nextRoomId,
              title: "메신저",
              preview: "새 메시지가 도착했습니다",
              dedupeKey,
            });
          }
          tryShowMessengerWebDesktopNotification({
            roomId: nextRoomId,
            title: "메신저",
            body: "새 메시지가 도착했습니다",
            nextUnread,
            prevUnread,
            activeCommunityRoomId: activeRoom,
            appVisibility,
            windowFocused: sfc?.isWindowFocused ?? true,
            communityChatEnabled: settings?.community_chat_enabled !== false,
            callStatus: useCallStore.getState().callStatus,
            onNavigateToRoom: navigateToCommunityRoom,
          });
          requestMessengerHubBadgeResync("participant_unread_changed");
        }
      )
      .subscribe();

    return () => {
      if (channel) void sb.removeChannel(channel);
    };
  }, [enabled, userId]);
}
