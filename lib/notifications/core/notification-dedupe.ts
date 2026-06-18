const EVENT_ID_TTL_MS = 10_000;
const ROOM_MESSAGE_TTL_MS = 10_000;

type TimedKey = { at: number };

const recentEventIds = new Map<string, TimedKey>();
const recentRoomMessages = new Map<string, TimedKey>();

function pruneMap(map: Map<string, TimedKey>, now: number, ttlMs: number): void {
  for (const [key, entry] of map) {
    if (now - entry.at > ttlMs) map.delete(key);
  }
}

export function shouldSkipPushForEventDedupe(notificationEventId: string): boolean {
  const id = notificationEventId.trim();
  if (!id) return false;
  const now = Date.now();
  pruneMap(recentEventIds, now, EVENT_ID_TTL_MS);
  if (recentEventIds.has(id)) return true;
  recentEventIds.set(id, { at: now });
  return false;
}

export function shouldSkipSoundForRoomMessage(roomId: string, messageId: string): boolean {
  const key = `${roomId.trim()}:${messageId.trim()}`;
  if (!key || key === ":") return false;
  const now = Date.now();
  pruneMap(recentRoomMessages, now, ROOM_MESSAGE_TTL_MS);
  if (recentRoomMessages.has(key)) return true;
  recentRoomMessages.set(key, { at: now });
  return false;
}

export function resetNotificationDedupeForTests(): void {
  recentEventIds.clear();
  recentRoomMessages.clear();
}
