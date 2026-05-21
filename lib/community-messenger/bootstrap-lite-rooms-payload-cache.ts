/**
 * `?lite=1` `fetchMyRoomsPayload` 프로세스 캐시 — warm 재요청 TTFB 완화.
 * `fresh=1` 은 route 에서 bypass (`bootstrapLiteRoomsCacheBypass` 로그).
 */

/** `fetchMyRoomsPayload` 반환형 — service 내부 타입과 구조 동일(순환 import 방지) */
export type BootstrapLiteRoomsPayloadCacheValue = {
  roomRows: unknown[];
  participantRows: unknown[];
  byRoomId: Map<string, unknown[]>;
  roomProfileMap: Map<string, unknown>;
  bootstrapLiteProfileLabels?: Map<string, unknown>;
};

const TTL_MS = 4_000;
const MAX_ENTRIES = 500;

type Entry = {
  payload: BootstrapLiteRoomsPayloadCacheValue;
  at: number;
};

const cache = new Map<string, Entry>();

function prune(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.at + TTL_MS <= now) cache.delete(key);
  }
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

export function peekBootstrapLiteRoomsPayload(userId: string): BootstrapLiteRoomsPayloadCacheValue | null {
  const now = Date.now();
  prune(now);
  const entry = cache.get(userId);
  if (!entry || entry.at + TTL_MS <= now) return null;
  return entry.payload;
}

export function storeBootstrapLiteRoomsPayload(userId: string, payload: BootstrapLiteRoomsPayloadCacheValue): void {
  const now = Date.now();
  prune(now);
  cache.set(userId, { payload, at: now });
}
