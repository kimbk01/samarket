import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { shouldSkipActiveCallRecoveryRouting } from "@/lib/community-messenger/call-active-session-recovery";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import {
  INCOMING_REMOTE_HARD_CLEAR_KEEP_MS,
  INCOMING_USER_DISMISSED_KEEP_MS,
  isDibayCallConsumed,
} from "@/lib/community-messenger/incoming-call-state";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

/** Realtime·GET 보강 전 Broadcast `invite_preview` 유지 (취소는 hardClear·dismiss로 제거) */
export const INCOMING_INVITE_PREVIEW_KEEP_MS = 12_000;

/** 서버 목록에 아직 없는 ringing 낙관 유지 */
export const INCOMING_OPTIMISTIC_KEEP_MS = 55_000;

function isUserDismissedIncomingSession(
  sessionId: string,
  dismissedAtBySessionId: Map<string, number>,
  now: number
): boolean {
  const at = dismissedAtBySessionId.get(sessionId);
  if (at == null) return false;
  return now - at < INCOMING_USER_DISMISSED_KEEP_MS;
}

function isHardClearedIncomingSession(
  sessionId: string,
  hardClearedAtBySessionId: Map<string, number>,
  now: number
): boolean {
  const at = hardClearedAtBySessionId.get(sessionId);
  if (at == null) return false;
  return now - at < INCOMING_REMOTE_HARD_CLEAR_KEEP_MS;
}

function shouldBlockStaleRingingSession(session: CommunityMessengerCallSession, now: number): boolean {
  if (session.status !== "ringing") return false;
  if (isDibayCallConsumed(session.id, now)) return true;
  if (shouldSkipActiveCallRecoveryRouting(session.id)) return true;
  return false;
}

export function mergeIncomingCallSessionsAfterFetch(
  viewerUserId: string | null,
  serverList: CommunityMessengerCallSession[],
  previous: CommunityMessengerCallSession[],
  dismissedAtBySessionId: Map<string, number>,
  hardClearedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();

  const filterBlocked = (list: CommunityMessengerCallSession[]) =>
    list.filter((s) => {
      if (shouldBlockStaleRingingSession(s, now)) {
        logDibayCall("stale_ringing_blocked", {
          sessionId: s.id,
          callId: s.id,
          source: "merge_fetch",
        });
        return false;
      }
      return true;
    });

  if (!viewerUserId) {
    return filterBlocked(
      serverList
        .filter((s) => !isDibayCallConsumed(s.id, now))
        .filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now))
        .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now))
    );
  }

  const serverFiltered = filterBlocked(
    serverList
      .filter((s) => !isDibayCallConsumed(s.id, now))
      .filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now))
      .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now))
  );
  const serverIds = new Set(serverFiltered.map((s) => s.id));
  const previousFiltered = previous
    .filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now))
    .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now));

  const optimisticExtras = previousFiltered.filter((s) => {
    if (isDibayCallConsumed(s.id, now)) return false;
    if (shouldSkipActiveCallRecoveryRouting(s.id)) return false;
    if (serverIds.has(s.id)) return false;
    if (s.status !== "ringing" || s.sessionMode !== "direct" || s.isMineInitiator) return false;
    if (!messengerUserIdsEqual(s.recipientUserId, viewerUserId)) return false;
    const started = new Date(s.startedAt).getTime();
    if (!Number.isFinite(started)) return false;

    if (s.isPreview === true || s.source === "invite_preview" || s.source === "fcm_wake") {
      return now - started <= INCOMING_INVITE_PREVIEW_KEEP_MS;
    }

    return now - started <= INCOMING_OPTIMISTIC_KEEP_MS;
  });

  if (optimisticExtras.length === 0) return serverFiltered;

  return [...serverFiltered, ...optimisticExtras].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
