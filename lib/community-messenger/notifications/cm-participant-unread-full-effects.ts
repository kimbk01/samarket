"use client";

/**
 * participants unread 증가 — badge / banner / desktop only.
 * GATE 2: SOUND = NO AUTHORITY. messageId ingress 가 음을 낸다.
 *
 * Root layout 참가자 브리지는 NotificationSurfaceProvider 밖이라 surfaceRef 가 null 이다.
 * 설정·activeRoom 은 `getNotificationSoundGateSnapshot()`(+ pathname) 폴백.
 */

import type { RefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
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
import {
  logCmSurfaceSync,
  noteCmParticipantSurfaceSoundHandled,
} from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
import { getNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate";
import {
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  messengerRoomListSourceFromPathname,
} from "@/lib/community-messenger/messenger-entry-origin";
import {
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";

function activeCommunityRoomIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function resolveParticipantSoundSurface(args: {
  surface: ReturnType<typeof useNotificationSurface>;
  pathname: string | null;
}): {
  activeRoom: string | null;
  windowFocused: boolean;
  communityChatEnabled: boolean;
} {
  const gate = getNotificationSoundGateSnapshot();
  const settings = args.surface?.userNotificationSettings ?? gate?.userNotificationSettings;
  const activeRoom =
    args.surface?.activeCommunityChatRoomId ??
    gate?.activeCommunityChatRoomId ??
    activeCommunityRoomIdFromPathname(args.pathname);
  return {
    activeRoom,
    windowFocused: args.surface?.isWindowFocused ?? gate?.isWindowFocused ?? true,
    communityChatEnabled: settings?.community_chat_enabled !== false,
  };
}

type TranslateFn = ReturnType<typeof useI18n>["t"];

function navigateToCommunityRoomLazy(
  routerRef: RefObject<AppRouterInstance>,
  pathnameRef: RefObject<string | null>,
  roomId: string
): void {
  const pathNow = pathnameRef.current ?? "";
  let fromQs: string | null = null;
  if (typeof window !== "undefined") {
    try {
      fromQs = new URLSearchParams(window.location.search).get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY);
    } catch {
      fromQs = null;
    }
  }
  void import("@/lib/community-messenger/community-messenger-room-forward-navigation").then((mod) => {
    void mod.runCommunityMessengerRoomForwardNavigation({
      router: routerRef.current,
      roomId,
      listSource: messengerRoomListSourceFromPathname(pathNow),
      fromEntryOrigin: fromQs,
    });
  });
}

export type CmParticipantUnreadFullEffectsArgs = {
  nextRoomId: string;
  nextUnread: number;
  prevUnread: number;
  latencyKey: string;
  viewerUserId?: string | null;
  pathnameRef: RefObject<string | null>;
  visibilityRef: RefObject<DocumentVisibilityState>;
  surfaceRef: RefObject<ReturnType<typeof useNotificationSurface>>;
  tRef: RefObject<TranslateFn>;
  routerRef: RefObject<AppRouterInstance>;
};

export function applyCmParticipantUnreadFullEffects(args: CmParticipantUnreadFullEffectsArgs): void {
  const {
    nextRoomId,
    nextUnread,
    prevUnread,
    latencyKey: key,
    pathnameRef,
    visibilityRef,
    surfaceRef,
    tRef,
    routerRef,
  } = args;

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let banner_ms: number | null = null;
  const onNavigateToRoom = (roomId: string) => navigateToCommunityRoomLazy(routerRef, pathnameRef, roomId);

  const sameRoomPath = pathnameRef.current === `/community-messenger/rooms/${nextRoomId}`;
  if (sameRoomPath) {
    noteCmParticipantSurfaceSoundHandled(nextRoomId);
  }

  if (!messengerRolloutUsesSurfaceAndVisibilityForSound()) {
    tryShowMessengerWebDesktopNotification({
      roomId: nextRoomId,
      title: tRef.current("notify_messenger_banner_title"),
      body: tRef.current("notify_messenger_new_message_arrived"),
      nextUnread,
      prevUnread,
      activeCommunityRoomId: activeCommunityRoomIdFromPathname(pathnameRef.current),
      appVisibility: documentVisibilityToAppVisibility(visibilityRef.current),
      windowFocused: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
      communityChatEnabled: surfaceRef.current?.userNotificationSettings?.community_chat_enabled !== false,
      callStatus: useCallStore.getState().callStatus,
      onNavigateToRoom,
    });
    requestMessengerHubBadgeResync("participant_unread_changed", {
      roomId: nextRoomId,
      participantUnreadDirection: "increase",
    });
    logCmSurfaceSync({
      phase: "participant_increase",
      roomId: nextRoomId,
      t0,
      bottom_ms: 0,
      list_cache_ms: 0,
      sound_schedule_ms: null,
      banner_ms: null,
      unread: nextUnread,
      prevUnread,
    });
    return;
  }

  const appVisibility = documentVisibilityToAppVisibility(visibilityRef.current);
  const { activeRoom, windowFocused, communityChatEnabled } = resolveParticipantSoundSurface({
    surface: surfaceRef.current,
    pathname: pathnameRef.current,
  });
  const scrollPolicy = messengerRolloutUsesRoomScrollHints();
  const scrollHint = scrollPolicy
    ? useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(nextRoomId)
    : null;

  cmReceiveLatencyMark(key, { notification_decision_ms: cmReceiveLatencyNow() });
  const { showAppLevelBanner, dedupeKey } = resolveParticipantUnreadDeltaInAppEffects({
    targetRoomId: nextRoomId,
    nextUnread,
    prevUnread,
    activeCommunityRoomId: activeRoom,
    appVisibility,
    sameRoomScrollHint: scrollHint,
    applySameRoomScrollPolicy: scrollPolicy,
    windowFocused,
  });

  logBadgeFdProbe("cm_participant_sound.decision", {
    roomId: nextRoomId,
    prevUnread,
    nextUnread,
    playInAppMessageSound: false,
    allowSound: false,
    skipReason: "unread_delta_not_sound_authority",
  });
  if (messengerRolloutShowsInAppMessageBanner() && dedupeKey && showAppLevelBanner) {
    useMessengerInAppMessageBannerStore.getState().pushOrMerge({
      roomId: nextRoomId,
      title: tRef.current("notify_messenger_banner_title"),
      preview: tRef.current("notify_messenger_new_message_arrived"),
      dedupeKey,
    });
    banner_ms = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
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
    windowFocused,
    communityChatEnabled,
    callStatus: useCallStore.getState().callStatus,
    onNavigateToRoom,
  });
  requestMessengerHubBadgeResync("participant_unread_changed", {
    roomId: nextRoomId,
    participantUnreadDirection: "increase",
  });
  logCmSurfaceSync({
    phase: "participant_increase",
    roomId: nextRoomId,
    t0,
    bottom_ms: 0,
    list_cache_ms: 0,
    sound_schedule_ms: null,
    banner_ms,
    unread: nextUnread,
    prevUnread,
  });
}
