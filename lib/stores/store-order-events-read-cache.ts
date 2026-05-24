import { isStoreOrderEventVisibleToBuyer } from "@/lib/stores/store-order-event-audience";
import type { StoreOrderEventRow } from "@/lib/stores/store-order-events";

type EventsCacheEntry = {
  expiresAt: number;
  cachedAt: number;
  body: { ok: true; events: unknown[] };
};

type EventsCacheGlobal = {
  __samarketStoreOrderEventsReadCache?: Map<string, EventsCacheEntry>;
  __samarketStoreOrderEventsCacheOps?: Map<string, { reason: string; at: number }>;
};

const STORE_ORDER_EVENTS_READ_TTL_MS = 4_000;

function cacheMap(): Map<string, EventsCacheEntry> {
  const g = globalThis as EventsCacheGlobal;
  if (!g.__samarketStoreOrderEventsReadCache) {
    g.__samarketStoreOrderEventsReadCache = new Map();
  }
  return g.__samarketStoreOrderEventsReadCache;
}

function opsMap(): Map<string, { reason: string; at: number }> {
  const g = globalThis as EventsCacheGlobal;
  if (!g.__samarketStoreOrderEventsCacheOps) {
    g.__samarketStoreOrderEventsCacheOps = new Map();
  }
  return g.__samarketStoreOrderEventsCacheOps;
}

export function noteStoreOrderEventsCacheOp(orderId: string, reason: string): void {
  const oid = orderId.trim();
  if (!oid) return;
  opsMap().set(oid, { reason, at: Date.now() });
}

export function lastStoreOrderEventsCacheOp(orderId: string): { reason: string; age_ms: number } | null {
  const row = opsMap().get(orderId.trim());
  if (!row) return null;
  return { reason: row.reason, age_ms: Math.max(0, Date.now() - row.at) };
}

/** orderId + viewer + role — ownership 과 분리. insert 시 write-through. */
export function storeOrderEventsReadCacheKey(params: {
  viewerUserId: string;
  orderId: string;
  audience: "buyer" | "owner";
}): string {
  return `store_order_events:${params.orderId.trim()}:${params.viewerUserId.trim()}:${params.audience}`;
}

export function storeOrderEventsReadCacheKeyShort(key: string): string {
  const k = key.trim();
  if (k.length <= 48) return k;
  return `${k.slice(0, 44)}…`;
}

export type StoreOrderEventsReadCachePeek = {
  hit: boolean;
  body: EventsCacheEntry["body"] | null;
  cache_age_ms: number;
  miss_reason?: string;
};

function sortEventsByCreatedAt(events: unknown[]): unknown[] {
  return [...events].sort((a, b) => {
    const ca = String((a as { created_at?: string }).created_at ?? "");
    const cb = String((b as { created_at?: string }).created_at ?? "");
    return ca.localeCompare(cb);
  });
}

function audienceFromReadCacheKey(key: string): "buyer" | "owner" | null {
  const tail = key.trim().split(":").pop();
  if (tail === "buyer" || tail === "owner") return tail;
  return null;
}

export function peekStoreOrderEventsReadCacheMeta(key: string, orderId?: string): StoreOrderEventsReadCachePeek {
  const hit = cacheMap().get(key);
  const now = Date.now();
  if (!hit || hit.expiresAt <= now) {
    if (hit) cacheMap().delete(key);
    const oid = orderId?.trim() ?? key.split(":")[1]?.trim() ?? "";
    const lastOp = oid ? lastStoreOrderEventsCacheOp(oid) : null;
    const miss_reason = hit ? "ttl_expired" : lastOp ? lastOp.reason : "cold";
    return { hit: false, body: null, cache_age_ms: 0, miss_reason };
  }
  return {
    hit: true,
    body: hit.body,
    cache_age_ms: Math.max(0, now - hit.cachedAt),
  };
}

export function peekStoreOrderEventsReadCache(key: string): EventsCacheEntry["body"] | null {
  return peekStoreOrderEventsReadCacheMeta(key).body;
}

function mergeEventsById(existing: unknown[], incoming: unknown[]): unknown[] {
  const byId = new Map<string, unknown>();
  for (const e of existing) {
    const id = String((e as { id?: string }).id ?? "");
    if (id) byId.set(id, e);
  }
  for (const e of incoming) {
    const id = String((e as { id?: string }).id ?? "");
    if (id) byId.set(id, e);
  }
  return sortEventsByCreatedAt([...byId.values()]);
}

export function setStoreOrderEventsReadCache(key: string, body: EventsCacheEntry["body"], reason?: string): void {
  const now = Date.now();
  const prev = cacheMap().get(key);
  let nextBody = body;
  if (prev && prev.expiresAt > now && prev.body.events.length > 0) {
    nextBody = { ok: true, events: mergeEventsById(prev.body.events, body.events) };
  }
  cacheMap().set(key, { body: nextBody, cachedAt: now, expiresAt: now + STORE_ORDER_EVENTS_READ_TTL_MS });
  const oid = key.split(":")[1]?.trim();
  if (oid) noteStoreOrderEventsCacheOp(oid, reason ?? "read_set");
  while (cacheMap().size > 500) {
    const k = cacheMap().keys().next().value;
    if (k === undefined) break;
    cacheMap().delete(k);
  }
}

/**
 * insert 성공 시 invalidate 대신 캐시에 append — polling 연속 hit 유지.
 * buyer audience 키는 visibility 필터 적용.
 */
export function writeThroughStoreOrderEventsReadCache(
  orderId: string,
  newEvent: StoreOrderEventRow
): { updated: number } {
  const oid = orderId.trim();
  if (!oid || !newEvent?.id) return { updated: 0 };
  const prefix = `store_order_events:${oid}:`;
  const now = Date.now();
  let updated = 0;

  for (const [key, entry] of cacheMap()) {
    if (!key.startsWith(prefix)) continue;
    const audience = audienceFromReadCacheKey(key);
    if (audience === "buyer" && !isStoreOrderEventVisibleToBuyer(newEvent)) continue;

    const events = entry.body.events;
    if (events.some((e) => String((e as { id?: string }).id ?? "") === newEvent.id)) continue;

    cacheMap().set(key, {
      body: { ok: true, events: sortEventsByCreatedAt([...events, newEvent]) },
      cachedAt: now,
      expiresAt: now + STORE_ORDER_EVENTS_READ_TTL_MS,
    });
    updated += 1;
  }

  noteStoreOrderEventsCacheOp(oid, updated > 0 ? "write_through_insert" : "write_through_no_entries");
  if (process.env.NODE_ENV === "development") {
    console.log("[store-order-events-read-cache] write_through", {
      orderId: oid,
      eventId: newEvent.id,
      updated,
    });
  }
  return { updated };
}

export function invalidateStoreOrderEventsReadCache(orderId?: string, reason?: string): void {
  const oid = orderId?.trim() ?? "";
  if (!oid) {
    cacheMap().clear();
    if (process.env.NODE_ENV === "development" && reason) {
      console.log("[store-order-events-read-cache] invalidate_all", { reason });
    }
    return;
  }
  const prefix = `store_order_events:${oid}:`;
  let removed = 0;
  for (const key of cacheMap().keys()) {
    if (key.startsWith(prefix)) {
      cacheMap().delete(key);
      removed += 1;
    }
  }
  if (removed > 0) {
    noteStoreOrderEventsCacheOp(oid, reason ?? "invalidate");
  }
  if (process.env.NODE_ENV === "development" && removed > 0) {
    console.log("[store-order-events-read-cache] invalidate", { orderId: oid, removed, reason: reason ?? "insert" });
  }
}

export const STORE_ORDER_EVENTS_READ_TTL_MS_EXPORT = STORE_ORDER_EVENTS_READ_TTL_MS;
