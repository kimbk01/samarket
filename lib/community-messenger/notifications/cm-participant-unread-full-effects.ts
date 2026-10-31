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
import type { MessengerInAppBannerContent } from "@/lib/community-messenger/notifications/messenger-in-app-banner-content";
import type { CommunityMessengerMessage, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { peekBootstrapCache, peekMessengerBootstrapCritical } from "@/lib/community-messenger/bootstrap-cache";
import { criticalRoomRowToRoomSummary } from "@/lib/community-messenger/home/critical-bootstrap-to-partial";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { getUserSettings } from "@/lib/settings/user-settings-store";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

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

/**
 * §14-11 M-B1 — 배너·데스크톱 알림 문구는 실제 메시지(OS 푸시와 같은 함수)로만 만든다.
 * 출처: 캐시 없는 최신 메시지 API + 홈 목록 행(방 이름·종류), 실패 시 홈 목록 행. 둘 다 없으면 null → 배너 생략(배지·목록은 이미 반영됨).
 * 스냅샷·문구 모듈은 event-path lazy (`prefetchRoomSnapshotLazy` 와 같은 청크 정책).
 */
async function resolveMessengerInAppBannerContent(
  roomId: string,
  viewerUserId: string | null | undefined
): Promise<MessengerInAppBannerContent | null> {
  const viewer = typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  if (!viewer) return null;
  const language = getRuntimeAppLanguage();
  const chatPreviewEnabled = getUserSettings(viewer).chat_preview_enabled !== false;
  const [snapMod, contentMod] = await Promise.all([
    import("@/lib/community-messenger/room-snapshot-cache"),
    import("@/lib/community-messenger/notifications/messenger-in-app-banner-content"),
  ]);
  /** §17 V-1: 최신 메시지는 캐시 없는 API(방 스냅샷 프리패치는 서버·엣지 캐시로 직전 글을 줄 수 있음) */
  const latest = await fetch(
    `/api/community-messenger/rooms/${encodeURIComponent(roomId)}/messages?latest=1&limit=5`,
    { cache: "no-store", credentials: "include" }
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null) as { ok?: boolean; messages?: CommunityMessengerMessage[] } | null;
  const row = findBannerListRoomRow(roomId, viewer);
  let cachedSnapshot = snapMod.peekRoomSnapshot(roomId, viewer);
  /**
   * 홈·다른 탭에서는 메신저 목록 캐시가 없을 수 있다 (2026-10-31 iPhone 실기: /philife·목록에서 배너 0건, 다른 방 안에서는 표시).
   * 방 정보가 없으면 참가자 브리지가 막 시작한 같은 방 스냅샷 요청(single-flight)이 끝나기를 기다린다 — 추가 요청 없음.
   */
  if (!row && !cachedSnapshot) {
    await snapMod.prefetchCommunityMessengerRoomSnapshot(roomId).catch(() => false);
    cachedSnapshot = snapMod.peekRoomSnapshot(roomId, viewer);
  }
  const room = row ?? cachedSnapshot?.room ?? null;
  if (latest?.ok && Array.isArray(latest.messages) && room) {
    const content = contentMod.buildMessengerInAppBannerContent({
      room,
      members: cachedSnapshot?.members ?? null,
      messages: latest.messages,
      viewerUserId: viewer,
      language,
      chatPreviewEnabled,
    });
    if (content) return content;
  }
  return row ? contentMod.buildMessengerInAppBannerContentFromListRow({ row, language, chatPreviewEnabled }) : null;
}

/**
 * 메신저 목록 캐시의 방 행 — 전체(full) 목록을 먼저, 없으면 첫 화면용 critical 목록에서 찾는다.
 * (critical 만 있는 동안 full 만 보면 방을 못 찾아 배너 문구를 만들지 못했다.)
 */
function findBannerListRoomRow(roomId: string, viewerUserId: string | null | undefined): CommunityMessengerRoomSummary | null {
  const fullRow = findHomeListRoomRow(peekBootstrapCache(), roomId);
  if (fullRow) return fullRow;
  const critical = peekMessengerBootstrapCritical();
  if (!critical) return null;
  const norm = normalizeMessengerRealtimeRoomId(roomId);
  if (!norm) return null;
  const hit = [...(critical.chats ?? []), ...(critical.groups ?? [])].find(
    (r) => normalizeMessengerRealtimeRoomId(r.room_id) === norm
  );
  return hit ? criticalRoomRowToRoomSummary(hit, typeof viewerUserId === "string" ? viewerUserId : null) : null;
}

/** 내용을 기다리는 사이 방에 들어갔거나 읽음 처리됐으면 띄우지 않는다. */
function bannerStillRelevant(
  roomId: string,
  pathnameRef: RefObject<string | null>,
  viewerUserId?: string | null
): boolean {
  if (activeCommunityRoomIdFromPathname(pathnameRef.current) === roomId) return false;
  const row = findBannerListRoomRow(roomId, viewerUserId);
  return !row || row.unreadCount > 0;
}

export type CmParticipantUnreadFullEffectsArgs = {
  nextRoomId: string;
  nextUnread: number;
  prevUnread: number;
  /** A-9: 서버 participants.is_muted — true 면 배너·데스크톱 알림 없음 */
  roomMuted?: boolean;
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
    void resolveMessengerInAppBannerContent(nextRoomId, args.viewerUserId).then((content) => {
      if (args.roomMuted === true) return;
      if (!content || !bannerStillRelevant(nextRoomId, pathnameRef, args.viewerUserId)) return;
      tryShowMessengerWebDesktopNotification({
        roomId: nextRoomId,
        title: content.title,
        body: content.preview,
        nextUnread,
        prevUnread,
        activeCommunityRoomId: activeCommunityRoomIdFromPathname(pathnameRef.current),
        appVisibility: documentVisibilityToAppVisibility(visibilityRef.current),
        windowFocused: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
        communityChatEnabled: surfaceRef.current?.userNotificationSettings?.community_chat_enabled !== false,
        callStatus: useCallStore.getState().callStatus,
        onNavigateToRoom,
      });
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
    roomMuted: args.roomMuted === true,
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
  // D-8 (재감사 P-11): 「메신저 채팅 알림」을 끄면 앱 안 배너도 띄우지 않는다 — 같은 경로의 데스크톱 알림과 같은 설정.
  const wantBanner =
    messengerRolloutShowsInAppMessageBanner() &&
    Boolean(dedupeKey) &&
    showAppLevelBanner &&
    communityChatEnabled;
  cmReceiveLatencyMark(key, { push_decision_ms: cmReceiveLatencyNow() });
  void resolveMessengerInAppBannerContent(nextRoomId, args.viewerUserId).then((content) => {
    if (!content || !bannerStillRelevant(nextRoomId, pathnameRef, args.viewerUserId)) return;
    if (args.roomMuted === true) return;
    if (wantBanner && dedupeKey) {
      useMessengerInAppMessageBannerStore.getState().pushOrMerge({
        roomId: nextRoomId,
        title: content.title,
        preview: content.preview,
        avatarUrl: content.avatarUrl,
        kind: content.kind,
        dedupeKey,
      });
    }
    tryShowMessengerWebDesktopNotification({
      roomId: nextRoomId,
      title: content.title,
      body: content.preview,
      nextUnread,
      prevUnread,
      activeCommunityRoomId: activeRoom,
      appVisibility,
      windowFocused,
      communityChatEnabled,
      callStatus: useCallStore.getState().callStatus,
      onNavigateToRoom,
    });
  });
  if (wantBanner) {
    banner_ms = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
  }
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
