/**
 * `/stores/owner` 허브 **타임라인·KPI meta** 전용 (라인아이템 없음).
 * 주문 관리 전체 목록은 `owner-store-orders-list-cache.ts` 만 사용.
 */
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";

export type OwnerHubDashboardOrdersCacheValue = {
  ok: true;
  orders: OwnerHubDashboardPack["orders"];
  meta: OwnerHubDashboardPack["meta"];
};

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

export function invalidateOwnerHubDashboardOrdersCache(storeId?: string): void {
  if (!storeId?.trim()) {
    cached = null;
    return;
  }
  if (cached?.storeId === storeId.trim()) cached = null;
}
