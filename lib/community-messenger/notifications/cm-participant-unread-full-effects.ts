"use client";

/**
 * participants unread 증가 — full playback 전용 (sound·banner·desktop·nav).
 * hub-sync 와 같은 턴에서 동기 호출한다 (dynamic import 금지 — 음 지연 원인).
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
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { shouldSuppressMessengerInAppSoundOnTradeExplorationSurface } from "@/lib/notifications/samarket-messenger-notification-regulations";
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
  let sound_schedule_ms: number | null = null;
  let banner_ms: number | null = null;
  const onNavigateToRoom = (roomId: string) => navigateToCommunityRoomLazy(routerRef, pathnameRef, roomId);

  if (!messengerRolloutUsesSurfaceAndVisibilityForSound()) {
    const sameRoomPath = pathnameRef.current === `/community-messenger/rooms/${nextRoomId}`;
    const visOk = typeof document !== "undefined" && document.visibilityState === "visible";
    const focusOk = typeof document === "undefined" || document.hasFocus();
    if (sameRoomPath && visOk && focusOk) {
      noteCmParticipantSurfaceSoundHandled(nextRoomId);
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
      noteCmParticipantSurfaceSoundHandled(nextRoomId);
      sound_schedule_ms =
        typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
    }
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
      sound_schedule_ms,
      banner_ms: null,
      unread: nextUnread,
      prevUnread,
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
  const { playInAppMessageSound, showAppLevelBanner, dedupeKey } = resolveParticipantUnreadDeltaInAppEffects({
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
    playInAppMessageSound && !shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(pathnameRef.current);
  if (dedupeKey) {
    noteCmParticipantSurfaceSoundHandled(nextRoomId);
  }
  if (dedupeKey && allowSound) {
    cmReceiveLatencyMark(key, { notification_sound_start_ms: cmReceiveLatencyNow() });
    playCoalescedChatNotificationSound(dedupeKey, "community_direct_chat");
    sound_schedule_ms =
      typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
  }
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
    windowFocused: sfc?.isWindowFocused ?? true,
    communityChatEnabled: settings?.community_chat_enabled !== false,
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
    sound_schedule_ms,
    banner_ms,
    unread: nextUnread,
    prevUnread,
  });
}
