import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/** 세션 장시간 사용 시 Realtime·부트스트랩 병합으로 키가 무한 증가하지 않게 상한 */
export const MESSENGER_REALTIME_TRACKED_ROOMS_CAP = 280;

export type MessengerRealtimePruneInput = {
  lastReadByRoomId: Record<string, string | null>;
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  activeRoomId: string | null;
};

function normalizeRoomKey(roomId: string | null | undefined): string {
  return String(roomId ?? "").trim().toLowerCase();
}

function lastMessageAtMs(messages: CommunityMessengerMessage[] | undefined): number {
  const last = messages?.[messages.length - 1];
  if (!last?.createdAt) return 0;
  const t = new Date(String(last.createdAt)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** active·최근 메시지 활동 우선으로 상한 유지 */
export function retentionScoreForTrackedRoom(canonicalId: string, input: MessengerRealtimePruneInput): number {
  let score = lastMessageAtMs(input.messagesByRoomId[canonicalId]);
  if (input.activeRoomId && normalizeRoomKey(input.activeRoomId) === normalizeRoomKey(canonicalId)) {
    score += 1e15;
  }
  return score;
}

export function pruneTrackedRoomMaps(input: MessengerRealtimePruneInput): MessengerRealtimePruneInput {
  const idSet = new Set<string>();
  for (const k of Object.keys(input.messagesByRoomId)) {
    const id = String(k).trim();
    if (id) idSet.add(id);
  }
  for (const k of Object.keys(input.lastReadByRoomId)) {
    const id = String(k).trim();
    if (id) idSet.add(id);
  }

  if (idSet.size <= MESSENGER_REALTIME_TRACKED_ROOMS_CAP) return input;

  const ranked = [...idSet]
    .map((id) => ({ id, score: retentionScoreForTrackedRoom(id, input) }))
    .sort((a, b) => b.score - a.score);
  const keep = new Set(ranked.slice(0, MESSENGER_REALTIME_TRACKED_ROOMS_CAP).map((x) => x.id));

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
