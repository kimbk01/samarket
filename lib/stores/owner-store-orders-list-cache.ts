/**
 * 매장 오너 **전체 주문 목록** 전용 캐시 (라인 `items[]` 포함).
 * 허브 타임라인 캐시(`owner-hub-dashboard-orders-cache`)와 분리 — 혼용 금지.
 */
import {
  parseOwnerStoreOrdersListFromApiJson,
  type OwnerStoreOrderListRow,
} from "@/lib/business/owner-store-order-list-row-bridge";
import {
  countOwnerStoreOrdersListServerCacheKeys,
  invalidateOwnerStoreOrdersListServerCache,
} from "@/lib/stores/owner-store-orders-list-server-cache";
import { logOwnerOrdersListCacheInvalidate } from "@/lib/stores/owner-orders-list-cache-invalidate-log";

export type OwnerStoreOrdersListCacheMeta = {
  pending_accept_count: number;
  refund_requested_count: number;
  pending_delivery_count: number;
};

export type OwnerStoreOrdersListCacheValue = {
  ok: true;
  orders: OwnerStoreOrderListRow[];
  meta: OwnerStoreOrdersListCacheMeta;
};

const TTL_MS = 120_000;

let cached: { storeId: string; expiresAt: number; value: OwnerStoreOrdersListCacheValue } | null =
  null;

function parseMeta(raw: unknown): OwnerStoreOrdersListCacheMeta | null {
  if (typeof raw !== "object" || raw == null) return null;
  const m = raw as Record<string, unknown>;
  return {
    pending_accept_count: Math.max(0, Math.floor(Number(m.pending_accept_count) || 0)),
    refund_requested_count: Math.max(0, Math.floor(Number(m.refund_requested_count) || 0)),
    pending_delivery_count: Math.max(0, Math.floor(Number(m.pending_delivery_count) || 0)),
  };
}

export function seedOwnerStoreOrdersListCacheFromJson(storeId: string, json: unknown): void {
  const sid = storeId.trim();
  if (!sid || typeof json !== "object" || json == null) return;
  const body = json as { ok?: boolean; meta?: unknown };
  if (!body.ok) return;
  const meta = parseMeta(body.meta);
  if (!meta) return;
  const orders = parseOwnerStoreOrdersListFromApiJson(json);
  cached = {
    storeId: sid,
    expiresAt: Date.now() + TTL_MS,
    value: { ok: true, orders, meta },
  };
}

export function peekOwnerStoreOrdersListCache(
  storeId: string
): OwnerStoreOrdersListCacheValue | null {
  const sid = storeId.trim();
  if (!sid || !cached || cached.storeId !== sid) return null;
  if (cached.expiresAt <= Date.now()) {
    cached = null;
    return null;
  }
  return cached.value;
}

export function invalidateOwnerStoreOrdersListCache(
  storeId?: string,
  ownerUserId?: string,
  logOpts?: {
    route?: string;
    orderId?: string;
    reason?: string;
    afterMutationSuccess?: boolean;
  }
): void {
  if (!storeId?.trim()) {
    cached = null;
    const removed = invalidateOwnerStoreOrdersListServerCache(undefined, ownerUserId);
    if (logOpts) {
      logOwnerOrdersListCacheInvalidate({
        route: logOpts.route ?? "unknown",
        store_id: "",
        order_id: logOpts.orderId,
        reason: logOpts.reason ?? "invalidate_all",
        invalidated: removed > 0 || cached === null ? 1 : 0,
        cache_key_count: countOwnerStoreOrdersListServerCacheKeys(),
        after_mutation_success: logOpts.afterMutationSuccess ? 1 : 0,
      });
    }
    return;
  }
  const sid = storeId.trim();
  const hadClientCache = cached?.storeId === sid;
  if (hadClientCache) cached = null;
  const removed = invalidateOwnerStoreOrdersListServerCache(sid, ownerUserId);
  if (logOpts) {
    logOwnerOrdersListCacheInvalidate({
      route: logOpts.route ?? "unknown",
      store_id: sid,
      order_id: logOpts.orderId,
      reason: logOpts.reason ?? "order_mutation",
      invalidated: removed > 0 || hadClientCache ? 1 : 0,
      cache_key_count: countOwnerStoreOrdersListServerCacheKeys(),
      after_mutation_success: logOpts.afterMutationSuccess ? 1 : 0,
    });
  }
}
