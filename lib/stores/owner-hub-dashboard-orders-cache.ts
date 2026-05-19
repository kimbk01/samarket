/**
 * `/stores/owner` RSC 선로딩 → 클라 `fetchStoreOrdersListDeduped` 첫 왕복 제거.
 */
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";

export type OwnerHubDashboardOrdersCacheValue = {
  ok: true;
  orders: OwnerHubDashboardPack["orders"];
  meta: OwnerHubDashboardPack["meta"];
};

/** 허브 체류 중 peek 히트로 orders 네트워크 0회 유지 */
const TTL_MS = 120_000;

let cached: { storeId: string; expiresAt: number; value: OwnerHubDashboardOrdersCacheValue } | null =
  null;

export function seedOwnerHubDashboardOrdersCache(
  storeId: string,
  pack: OwnerHubDashboardPack
): void {
  const sid = storeId.trim();
  if (!sid) return;
  cached = {
    storeId: sid,
    expiresAt: Date.now() + TTL_MS,
    value: { ok: true, orders: pack.orders, meta: pack.meta },
  };
}

export function peekOwnerHubDashboardOrdersCache(
  storeId: string
): OwnerHubDashboardOrdersCacheValue | null {
  const sid = storeId.trim();
  if (!sid || !cached || cached.storeId !== sid) return null;
  if (cached.expiresAt <= Date.now()) {
    cached = null;
    return null;
  }
  return cached.value;
}

/** GET …/orders 응답으로 캐시 갱신 — RSC 시드 TTL 만료 후 재조회·pull-to-refresh */
export function seedOwnerHubDashboardOrdersCacheFromListJson(
  storeId: string,
  json: unknown
): void {
  const sid = storeId.trim();
  if (!sid || typeof json !== "object" || json == null) return;
  const body = json as {
    ok?: boolean;
    orders?: OwnerHubDashboardPack["orders"];
    meta?: {
      pending_accept_count?: unknown;
      refund_requested_count?: unknown;
      pending_delivery_count?: unknown;
    };
  };
  if (!body.ok || !Array.isArray(body.orders) || !body.meta) return;
  seedOwnerHubDashboardOrdersCache(sid, {
    orders: body.orders,
    meta: {
      pending_accept_count: Math.max(0, Math.floor(Number(body.meta.pending_accept_count) || 0)),
      refund_requested_count: Math.max(0, Math.floor(Number(body.meta.refund_requested_count) || 0)),
      pending_delivery_count: Math.max(0, Math.floor(Number(body.meta.pending_delivery_count) || 0)),
    },
  });
}

export function invalidateOwnerHubDashboardOrdersCache(storeId?: string): void {
  if (!storeId?.trim()) {
    cached = null;
    return;
  }
  if (cached?.storeId === storeId.trim()) cached = null;
}
