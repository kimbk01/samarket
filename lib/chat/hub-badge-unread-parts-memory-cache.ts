/**
 * Hub badge unread_parts — process memory read-through (counter/RPC 위 1단).
 * counter table SELECT·RPC RTT를 연속 hub badge 요청에서 생략.
 */

/** counter row와 동일 4필드 — `user-chat-unread-parts` 순환 import 방지 */
export type HubBadgeUnreadPartsMemoryValue = {
  storeOrderParticipantUnread: number;
  itemTradeParticipantUnread: number;
  communityParticipantUnread: number;
  productChatUnreadDeduped: number;
};

const DEFAULT_TTL_MS = 5_000;

type MemoryEntry = {
  parts: HubBadgeUnreadPartsMemoryValue;
  cachedAt: number;
  expiresAt: number;
};

const memoryByUser = new Map<string, MemoryEntry>();

export function hubBadgeUnreadPartsMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_UNREAD_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 3_000) return DEFAULT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(n)));
}

export function invalidateHubBadgeUnreadPartsMemory(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  memoryByUser.delete(k);
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByUser) {
    if (row.expiresAt <= now) memoryByUser.delete(key);
  }
  while (memoryByUser.size > 500) {
    const first = memoryByUser.keys().next().value;
    if (first === undefined) break;
    memoryByUser.delete(first);
  }
}

export type HubBadgeUnreadPartsMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; parts: HubBadgeUnreadPartsMemoryValue; ageMs: number };

export function readHubBadgeUnreadPartsMemory(userId: string): HubBadgeUnreadPartsMemoryRead {
  const k = userId.trim();
  if (!k) return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByUser.get(k);
  if (!row) return { hit: false, reason: "miss" };
  if (row.expiresAt <= now) {
    memoryByUser.delete(k);
    return { hit: false, reason: "expired" };
  }
  return { hit: true, parts: row.parts, ageMs: Math.max(0, now - row.cachedAt) };
}

export function writeHubBadgeUnreadPartsMemory(
  userId: string,
  parts: HubBadgeUnreadPartsMemoryValue
): void {
  const k = userId.trim();
  if (!k) return;
  const now = Date.now();
  const ttl = hubBadgeUnreadPartsMemoryTtlMs();
  memoryByUser.set(k, {
    parts,
    cachedAt: now,
    expiresAt: now + ttl,
  });
  pruneExpired(now);
}
