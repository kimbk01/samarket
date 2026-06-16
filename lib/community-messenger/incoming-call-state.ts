import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export const INCOMING_USER_DISMISSED_KEEP_MS = 120_000;
export const INCOMING_REMOTE_HARD_CLEAR_KEEP_MS = 120_000;

export function pruneDismissedIncomingSessionIds(dismissedAtBySessionId: Map<string, number>): void {
  const now = Date.now();
  for (const [id, at] of [...dismissedAtBySessionId.entries()]) {
    if (now - at > INCOMING_USER_DISMISSED_KEEP_MS) dismissedAtBySessionId.delete(id);
  }
}

function isUserDismissedIncomingSession(id: string, dismissedAtBySessionId: Map<string, number>, now: number): boolean {
  const at = dismissedAtBySessionId.get(id);
  return at != null && now - at <= INCOMING_USER_DISMISSED_KEEP_MS;
}

export function filterIncomingSessionsRespectingDismissed(
  list: CommunityMessengerCallSession[],
  dismissedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneDismissedIncomingSessionIds(dismissedAtBySessionId);
  return list.filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now));
}

export function pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId: Map<string, number>): void {
  const now = Date.now();
  for (const [id, at] of [...hardClearedAtBySessionId.entries()]) {
    if (now - at > INCOMING_REMOTE_HARD_CLEAR_KEEP_MS) hardClearedAtBySessionId.delete(id);
  }
}

function isHardClearedIncomingSession(id: string, hardClearedAtBySessionId: Map<string, number>, now: number): boolean {
  const at = hardClearedAtBySessionId.get(id);
  return at != null && now - at <= INCOMING_REMOTE_HARD_CLEAR_KEEP_MS;
}

export function isIncomingSessionHardCleared(
  sessionId: string,
  hardClearedAtBySessionId: Map<string, number>,
  now: number
): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  return isHardClearedIncomingSession(sid, hardClearedAtBySessionId, now);
}

export function filterIncomingSessionsRespectingHardClear(
  list: CommunityMessengerCallSession[],
  hardClearedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId);
  return list.filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now));
}

