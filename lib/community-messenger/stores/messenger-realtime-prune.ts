import type { CommunityMessengerMessage, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** 세션 장시간 사용 시 Realtime·부트스트랩 병합으로 키가 무한 증가하지 않게 상한 */
export const MESSENGER_REALTIME_TRACKED_ROOMS_CAP = 280;

export type MessengerRealtimePruneInput = {
  roomSummariesById: Record<string, CommunityMessengerRoomSummary>;
  unreadByRoomId: Record<string, number>;
  lastReadByRoomId: Record<string, string | null>;
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  activeRoomId: string | null;
};

function normalizeRoomKey(roomId: string | null | undefined): string {
  return String(roomId ?? "").trim().toLowerCase();
}

function lastMessageAtMs(room: CommunityMessengerRoomSummary | undefined): number {
  if (!room?.lastMessageAt) return 0;
  const t = new Date(String(room.lastMessageAt)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * active·미읽음·최근 활동 우선으로 상한 유지.
 * (요약 없이 unread 만 있는 고아 키도 상한에 포함 — 세션 누적 방지)
 */
export function retentionScoreForTrackedRoom(
  canonicalId: string,
  input: MessengerRealtimePruneInput
): number {
  const unread = Math.max(0, Math.floor(Number(input.unreadByRoomId[canonicalId] ?? 0) || 0));
  const lastAt = lastMessageAtMs(input.roomSummariesById[canonicalId]);
  let score = lastAt + unread * 86_400_000;
  if (input.activeRoomId && normalizeRoomKey(input.activeRoomId) === normalizeRoomKey(canonicalId)) {
    score += 1e15;
  }
  return score;
}

export function pruneTrackedRoomMaps(input: MessengerRealtimePruneInput): MessengerRealtimePruneInput {
  const idSet = new Set<string>();
  for (const k of Object.keys(input.roomSummariesById)) {
    const id = String(k).trim();
    if (id) idSet.add(id);
  }
  for (const k of Object.keys(input.unreadByRoomId)) {
    const id = String(k).trim();
    if (id) idSet.add(id);
  }
  for (const k of Object.keys(input.messagesByRoomId)) {
    const id = String(k).trim();
    if (id) idSet.add(id);
  }

  if (idSet.size <= MESSENGER_REALTIME_TRACKED_ROOMS_CAP) return input;

  const ranked = [...idSet]
    .map((id) => ({ id, score: retentionScoreForTrackedRoom(id, input) }))
    .sort((a, b) => b.score - a.score);
  const keep = new Set(ranked.slice(0, MESSENGER_REALTIME_TRACKED_ROOMS_CAP).map((x) => x.id));

  const roomSummariesById: Record<string, CommunityMessengerRoomSummary> = {};
  for (const id of keep) {
    const v = input.roomSummariesById[id];
    if (v) roomSummariesById[id] = v;
  }

  const unreadByRoomId: Record<string, number> = {};
  for (const id of keep) {
    if (Object.prototype.hasOwnProperty.call(input.unreadByRoomId, id)) {
      unreadByRoomId[id] = input.unreadByRoomId[id]!;
    }
  }

  const lastReadByRoomId: Record<string, string | null> = {};
  for (const id of keep) {
    if (Object.prototype.hasOwnProperty.call(input.lastReadByRoomId, id)) {
      lastReadByRoomId[id] = input.lastReadByRoomId[id] ?? null;
    }
  }

  const messagesByRoomId: Record<string, CommunityMessengerMessage[]> = {};
  for (const id of keep) {
    const list = input.messagesByRoomId[id];
    if (list?.length) messagesByRoomId[id] = list;
  }

  return {
    roomSummariesById,
    unreadByRoomId,
    lastReadByRoomId,
    messagesByRoomId,
    activeRoomId: input.activeRoomId,
  };
}

/** `seenIncomingMessageIdsByRoom` 키(room 소문자)와 동일 규칙 */
export function pruneSeenIncomingMessageIdsByRoom(keepCanonicalRoomIds: Set<string>, map: Map<string, Set<string>>): void {
  const keepNorm = new Set<string>();
  for (const id of keepCanonicalRoomIds) {
    const k = normalizeRoomKey(id);
    if (k) keepNorm.add(k);
  }
  for (const key of [...map.keys()]) {
    if (!keepNorm.has(normalizeRoomKey(key))) {
      map.delete(key);
    }
  }
}
