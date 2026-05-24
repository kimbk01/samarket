import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";

export type StoreOrderEventOwnershipRole = "buyer" | "owner" | "admin" | "none";

export type StoreOrderEventOwnershipSnapshot = {
  role: StoreOrderEventOwnershipRole;
  storeId: string;
  orderId: string;
  buyerId: string;
  ownerAllowed: boolean;
  createdAt: number;
};

type OwnershipCacheEntry = StoreOrderEventOwnershipSnapshot & { expiresAt: number };

type OwnershipCacheGlobal = {
  __samarketStoreOrderEventOwnershipCache?: Map<string, OwnershipCacheEntry>;
};

const OWNERSHIP_ALLOWED_TTL_MS = 12_000;
const OWNERSHIP_DENIED_TTL_MS = 2_500;

function cacheMap(): Map<string, OwnershipCacheEntry> {
  const g = globalThis as OwnershipCacheGlobal;
  if (!g.__samarketStoreOrderEventOwnershipCache) {
    g.__samarketStoreOrderEventOwnershipCache = new Map();
  }
  return g.__samarketStoreOrderEventOwnershipCache;
}

export function storeOrderEventOwnershipCacheKey(orderId: string, viewerUserId: string): string {
  return `store_order_event_ownership:${orderId.trim()}:${viewerUserId.trim()}`;
}

export function peekStoreOrderEventOwnershipCache(
  orderId: string,
  viewerUserId: string
): { hit: boolean; snapshot: StoreOrderEventOwnershipSnapshot | null; ttlRemainingMs: number } {
  const key = storeOrderEventOwnershipCacheKey(orderId, viewerUserId);
  const row = cacheMap().get(key);
  const now = Date.now();
  if (!row || row.expiresAt <= now) {
    if (row) cacheMap().delete(key);
    return { hit: false, snapshot: null, ttlRemainingMs: 0 };
  }
  const { expiresAt, ...snapshot } = row;
  return {
    hit: true,
    snapshot,
    ttlRemainingMs: Math.max(0, expiresAt - now),
  };
}

function setOwnershipCache(
  orderId: string,
  viewerUserId: string,
  snapshot: StoreOrderEventOwnershipSnapshot,
  allowed: boolean
): void {
  const key = storeOrderEventOwnershipCacheKey(orderId, viewerUserId);
  const ttl = allowed ? OWNERSHIP_ALLOWED_TTL_MS : OWNERSHIP_DENIED_TTL_MS;
  cacheMap().set(key, { ...snapshot, expiresAt: Date.now() + ttl });
  while (cacheMap().size > 800) {
    const k = cacheMap().keys().next().value;
    if (k === undefined) break;
    cacheMap().delete(k);
  }
}

export type ResolveStoreOrderEventOwnershipResult =
  | {
      ok: true;
      role: StoreOrderEventOwnershipRole;
      audience: "buyer" | "owner";
      storeId: string;
      buyerOk: boolean;
      ownerAllowed: boolean;
      ownership_cache_hit: 0 | 1;
      ownership_ms: number;
    }
  | {
      ok: false;
      status: 404 | 403;
      ownership_cache_hit: 0 | 1;
      ownership_ms: number;
    };

/**
 * order row + owner gate — event insert와 무관, 10~15s TTL (거부 none 은 2.5s).
 */
export async function resolveStoreOrderEventOwnershipCached(
  sb: SupabaseClient,
  viewerUserId: string,
  orderId: string
): Promise<ResolveStoreOrderEventOwnershipResult> {
  const t0 = Date.now();
  const uid = viewerUserId.trim();
  const oid = orderId.trim();

  const cached = peekStoreOrderEventOwnershipCache(oid, uid);
  if (cached.hit && cached.snapshot) {
    const snap = cached.snapshot;
    const ownership_ms = Math.max(0, Date.now() - t0);
    if (snap.role === "none" || !snap.ownerAllowed) {
      return {
        ok: false,
        status: snap.role === "none" && !snap.buyerId ? 404 : 403,
        ownership_cache_hit: 1,
        ownership_ms,
      };
    }
    const audience: "buyer" | "owner" = snap.role === "buyer" ? "buyer" : "owner";
    return {
      ok: true,
      role: snap.role,
      audience,
      storeId: snap.storeId,
      buyerOk: snap.role === "buyer",
      ownerAllowed: snap.ownerAllowed,
      ownership_cache_hit: 1,
      ownership_ms,
    };
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, store_id")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) {
    const ownership_ms = Math.max(0, Date.now() - t0);
    setOwnershipCache(
      oid,
      uid,
      {
        role: "none",
        storeId: "",
        orderId: oid,
        buyerId: "",
        ownerAllowed: false,
        createdAt: Date.now(),
      },
      false
    );
    return { ok: false, status: 404, ownership_cache_hit: 0, ownership_ms };
  }

  const buyerId = String(order.buyer_user_id ?? "").trim();
  const storeId = String(order.store_id ?? "").trim();
  const buyerOk = buyerId === uid;

  if (buyerOk) {
    setOwnershipCache(
      oid,
      uid,
      {
        role: "buyer",
        storeId,
        orderId: oid,
        buyerId,
        ownerAllowed: true,
        createdAt: Date.now(),
      },
      true
    );
    return {
      ok: true,
      role: "buyer",
      audience: "buyer",
      storeId,
      buyerOk: true,
      ownerAllowed: true,
      ownership_cache_hit: 0,
      ownership_ms: Math.max(0, Date.now() - t0),
    };
  }

  const ownerGate = storeId ? await getCachedStoreIfOwner(sb, uid, storeId) : { ok: false as const };
  const ownership_ms = Math.max(0, Date.now() - t0);
  if (!ownerGate.ok) {
    setOwnershipCache(
      oid,
      uid,
      {
        role: "none",
        storeId,
        orderId: oid,
        buyerId,
        ownerAllowed: false,
        createdAt: Date.now(),
      },
      false
    );
    return { ok: false, status: 403, ownership_cache_hit: 0, ownership_ms };
  }

  setOwnershipCache(
    oid,
    uid,
    {
      role: "owner",
      storeId,
      orderId: oid,
      buyerId,
      ownerAllowed: true,
      createdAt: Date.now(),
    },
    true
  );
  return {
    ok: true,
    role: "owner",
    audience: "owner",
    storeId,
    buyerOk: false,
    ownerAllowed: true,
    ownership_cache_hit: 0,
    ownership_ms,
  };
}

export const STORE_ORDER_EVENT_OWNERSHIP_ALLOWED_TTL_MS = OWNERSHIP_ALLOWED_TTL_MS;
export const STORE_ORDER_EVENT_OWNERSHIP_DENIED_TTL_MS = OWNERSHIP_DENIED_TTL_MS;
