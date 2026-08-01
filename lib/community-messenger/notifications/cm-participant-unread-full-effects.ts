"use client";

/**
 * participants unread 증가 — full playback 전용 (sound·banner·desktop·nav).
 * hub-sync 와 같은 턴에서 동기 호출한다 (dynamic import 금지 — 음 지연 원인).
 *
 * 알림음 억제 (텔레그램·카톡형):
 * - 현재 보고 있는 바로 그 방 (activeRoomId === roomId)
 * - 방 음소거 / 앱·도메인 알림음 OFF
 * - silent delivery / 중복 스케줄
 * pathname(`/market` 등)만으로 general_direct·group 음을 막지 않는다.
 *
 * Root layout 참가자 브리지는 NotificationSurfaceProvider 밖이라 surfaceRef 가 null 이다.
 * 설정·activeRoom 은 `getNotificationSoundGateSnapshot()`(+ pathname) 폴백.
 * settings 미수신 시 sound OFF 로 오판하지 않는다 (`=== false` 만 억제).
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
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
import { getNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate";
import { resolveCmInAppSoundNotificationDomain } from "@/lib/community-messenger/notifications/cm-in-app-sound-domain";
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

/**
 * `MainShellMessengerParticipantBridge` 는 root layout 에 있어
 * `useNotificationSurface()` 가 null 이다. Provider 는 children 쪽에서
 * `syncNotificationSoundGateSnapshot` 으로 모듈 게이트를 갱신하므로 그걸 폴백한다.
 * settings 미수신 시 기본은 음 허용 (undefined → OFF 로 오판 금지).
 */
function resolveParticipantSoundSurface(args: {
  surface: ReturnType<typeof useNotificationSurface>;
  pathname: string | null;
}): {
  activeRoom: string | null;
  suppressSound: boolean;
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
    suppressSound:
      settings?.sound_enabled === false || settings?.community_chat_enabled === false,
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
  /** Domain resolve — snapshot/bootstrap chatDomain. 없으면 재생 생략. */
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
    viewerUserId,
    pathnameRef,
    visibilityRef,
    surfaceRef,
    tRef,
    routerRef,
  } = args;

  const soundDomain = resolveCmInAppSoundNotificationDomain(nextRoomId, viewerUserId ?? null);

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let sound_schedule_ms: number | null = null;
  let banner_ms: number | null = null;
  const onNavigateToRoom = (roomId: string) => navigateToCommunityRoomLazy(routerRef, pathnameRef, roomId);

  if (!messengerRolloutUsesSurfaceAndVisibilityForSound()) {
    const sameRoomPath = pathnameRef.current === `/community-messenger/rooms/${nextRoomId}`;
    const visOk = typeof document !== "undefined" && document.visibilityState === "visible";
    const focusOk = typeof document === "undefined" || document.hasFocus();
    if (sameRoomPath && visOk && focusOk) {
      /** 현재 방 — 강한 음·notif INSERT 중복음 차단 */
      noteCmParticipantSurfaceSoundHandled(nextRoomId);
      requestMessengerHubBadgeResync("participant_unread_changed", {
        roomId: nextRoomId,
        participantUnreadDirection: "increase",
      });
      return;
    }
    /** domain 미상 — CM 재생 생략만. INSERT 가 row domain 으로 소유권 가져가도록 handled 금지. */
    if (soundDomain) {
      const scheduled = playCoalescedChatNotificationSound(
        `community-messenger:${nextRoomId}:${prevUnread}->${nextUnread}:${Date.now()}`,
        soundDomain
      );
      if (scheduled.status === "scheduled") {
        noteCmParticipantSurfaceSoundHandled(nextRoomId);
        sound_schedule_ms =
          typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
      }
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

  const appVisibility = documentVisibilityToAppVisibility(visibilityRef.current);
  const {
    activeRoom,
    suppressSound,
    windowFocused,
    communityChatEnabled,
  } = resolveParticipantSoundSurface({
    surface: surfaceRef.current,
    pathname: pathnameRef.current,
  });
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
    windowFocused,
  });

  /**
   * allowSound = domain/room/user 정책만 (pathname `/market` 억제 금지).
   * 배너와 소리는 같은 decision 에서 파생하되 결과가 다를 수 있음(현재 방 등).
   */
  const allowSound = playInAppMessageSound && soundDomain != null;
  let insertOwnerClaimed = false;
  let coalesceStatus: string | null = null;
  if (dedupeKey && allowSound && soundDomain) {
    cmReceiveLatencyMark(key, { notification_sound_start_ms: cmReceiveLatencyNow() });
    const scheduled = playCoalescedChatNotificationSound(dedupeKey, soundDomain);
    coalesceStatus = scheduled.status;
    if (scheduled.status === "scheduled") {
      noteCmParticipantSurfaceSoundHandled(nextRoomId);
      insertOwnerClaimed = true;
      sound_schedule_ms =
        typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
    }
  } else if (dedupeKey && !playInAppMessageSound) {
    /**
     * 현재 방·음소거·설정 OFF — 의도적 억제만 INSERT 중복음 차단.
     * domain 미상(soundDomain==null)인데 정책상 재생 허용이면 INSERT 가 row domain 소유.
     */
    noteCmParticipantSurfaceSoundHandled(nextRoomId);
    insertOwnerClaimed = true;
  }
  logBadgeFdProbe("cm_participant_sound.decision", {
    roomId: nextRoomId,
    prevUnread,
    nextUnread,
    playInAppMessageSound,
    allowSound,
    soundDomain,
    insertOwnerClaimed,
    coalesceStatus,
    soundScheduleMs: sound_schedule_ms,
    skipReason: !playInAppMessageSound
      ? "policy_suppress"
      : soundDomain == null
        ? "domain_unknown_insert_may_own"
        : coalesceStatus === "scheduled"
          ? null
          : coalesceStatus,
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
    sound_schedule_ms,
    banner_ms,
    unread: nextUnread,
    prevUnread,
  });
}
