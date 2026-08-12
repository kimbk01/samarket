/**
 * participants unread → Bottom / list cache / banner 동시 표면.
 * GATE 2: SOUND 권위 아님. 인앱 음은 messageId / notification_events.id.
 */

import { applyBootstrapCacheBusEvent } from "@/lib/community-messenger/home/bootstrap-cache-bus-writer";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import { applyMessengerRoomUnreadFactAndSyncBottom } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import { normalizeLocalReadGuardRoomId } from "@/lib/community-messenger/read/local-read-guard";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";

/** participant 경로가 음을 낸 직후 notif INSERT 중복음 차단 창 */
const CM_PARTICIPANT_SOUND_DEDUP_MS = 4_000;

const participantSoundHandledAt = new Map<string, number>();

export type CmSurfaceSyncPhase =
  | "participant_increase"
  | "participant_decrease"
  | "optimistic_read_zero";

export type CmSurfaceSyncLog = {
  phase: CmSurfaceSyncPhase;
  roomId: string;
  t0: number;
  bottom_ms: number | null;
  list_cache_ms: number | null;
  sound_schedule_ms: number | null;
  banner_ms: number | null;
  unread: number;
  prevUnread?: number;
  /** P3-c1 — decrease 가 room fact 로 Projection Authority 에 커밋되었는지. */
  authorityApplied?: boolean;
  /** P3-c1 — 이 decrease 가 `badge-count?fresh=1` 재조회를 발행했는지(1) / 생략했는지(0). */
  freshResync?: 0 | 1;
};

export function logCmSurfaceSync(payload: CmSurfaceSyncLog): void {
  // JSON 한 줄 — CDP `console.text()` 가 object 를 잘라 먹지 않게 한다.
  // eslint-disable-next-line no-console -- surface sync diagnostics
  console.info(`[cm-surface-sync] ${JSON.stringify(payload)}`);
}

export function noteCmParticipantSurfaceSoundHandled(roomId: string): void {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  if (!rid) return;
  participantSoundHandledAt.set(rid, Date.now());
}

export function shouldSkipNotificationInsertSoundForCmParticipant(roomId: string | null | undefined): boolean {
  const rid = normalizeLocalReadGuardRoomId(roomId ?? "");
  if (!rid) return false;
  const at = participantSoundHandledAt.get(rid);
  if (at == null) return false;
  return Date.now() - at < CM_PARTICIPANT_SOUND_DEDUP_MS;
}

export function clearCmParticipantSurfaceSoundHandledForTests(): void {
  participantSoundHandledAt.clear();
}

/** `/community-messenger/rooms/:id` href·path → roomId */
export function communityMessengerRoomIdFromHref(href: string | null | undefined): string | null {
  const raw = typeof href === "string" ? href.trim() : "";
  if (!raw) return null;
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname;
    } else {
      path = raw.split("?")[0] ?? raw;
    }
  } catch {
    path = raw.split("?")[0] ?? raw;
  }
  const m = path.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * 종·푸시·배너에서 방 진입 직전 동기 호출 — INSERT 중복음만 막는다.
 * pending hydrate 무효화는 `invalidateChatRoomEntryInAppSound` (NotificationSurface 방 진입) 권위.
 */
export function suppressCmRoomEntryNotificationSound(hrefOrRoomId: string | null | undefined): void {
  const asPath = communityMessengerRoomIdFromHref(hrefOrRoomId);
  const asId =
    !asPath &&
    typeof hrefOrRoomId === "string" &&
    hrefOrRoomId.trim() &&
    !hrefOrRoomId.includes("/")
      ? normalizeLocalReadGuardRoomId(hrefOrRoomId)
      : null;
  const rid = asPath ?? asId;
  if (!rid) return;
  noteCmParticipantSurfaceSoundHandled(rid);
}

export function dismissMessengerInAppBannerForRoom(roomId: string): void {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  if (!rid) return;
  const cur = useMessengerInAppMessageBannerStore.getState().banner;
  if (!cur) return;
  if (normalizeLocalReadGuardRoomId(cur.roomId) !== rid) return;
  useMessengerInAppMessageBannerStore.getState().dismiss();
}

/**
 * 낙관 읽음 0 — Bottom + list bus/cache + banner 를 같은 스택에서 맞춤.
 * (홈 list React 는 bus 수신부 `bypassRenderPause` 와 함께 동작)
 */
export function applyOptimisticUnreadZeroSurfaces(args: {
  roomId: string;
  viewerUserId: string;
  prevUnreadHint?: number;
}): { bottomRoomCount: number; hubSynced: boolean } {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const rid = args.roomId.trim();
  const vid = args.viewerUserId.trim();
  const eventVersion = Date.now();
  const applied = applyMessengerRoomUnreadFactAndSyncBottom({
    roomId: rid,
    viewerUserId: vid,
    unreadCount: 0,
    prevUnreadHint: args.prevUnreadHint,
    lastMessageAt: null,
    versionMs: eventVersion,
    source: "participant_rt",
    authoritySource: "optimistic_read",
    eventIdentity: `optimistic_read:${rid}:0:${eventVersion}`,
  });
  const bottom_ms =
    typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;

  const summaryPatch = {
    type: "cm.room.summary_patch" as const,
    roomId: rid,
    viewerUserId: vid,
    unreadCount: 0,
    at: Date.now(),
  };
  postCommunityMessengerBusEvent(summaryPatch);
  applyBootstrapCacheBusEvent(summaryPatch, vid, "cm-optimistic-read-zero");
  const list_cache_ms =
    typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;

  dismissMessengerInAppBannerForRoom(rid);
  const banner_ms =
    typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;

  logCmSurfaceSync({
    phase: "optimistic_read_zero",
    roomId: rid,
    t0,
    bottom_ms,
    list_cache_ms,
    sound_schedule_ms: null,
    banner_ms,
    unread: 0,
    prevUnread: args.prevUnreadHint,
  });

  return {
    bottomRoomCount: applied.bottomRoomCount,
    hubSynced: applied.hubSynced,
  };
}
