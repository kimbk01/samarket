/**
 * `/stores/owner` RSC 대시보드 meta → `fetchStoreOrderCountsDeduped` 첫 왕복 제거.
 */
export type OwnerHubOrderCountsCacheValue = {
  ok: true;
  pending_accept_count: number;
  refund_requested_count: number;
  pending_delivery_count: number;
};

const TTL_MS = 20_000;

let cached: { storeId: string; expiresAt: number; value: OwnerHubOrderCountsCacheValue } | null =
  null;

export function seedOwnerHubOrderCountsCache(
  storeId: string,
  meta: {
    pending_accept_count: number;
    refund_requested_count: number;
    pending_delivery_count: number;
  }
): void {
  const sid = storeId.trim();
  if (!sid) return;
  cached = {
    storeId: sid,
    expiresAt: Date.now() + TTL_MS,
    value: {
      ok: true,
      pending_accept_count: Math.max(0, meta.pending_accept_count),
      refund_requested_count: Math.max(0, meta.refund_requested_count),
      pending_delivery_count: Math.max(0, meta.pending_delivery_count),
    },
  };
}

export function peekOwnerHubOrderCountsCache(storeId: string): OwnerHubOrderCountsCacheValue | null {
  const sid = storeId.trim();
  if (!sid || !cached || cached.storeId !== sid) return null;
  if (cached.expiresAt <= Date.now()) {
    cached = null;
    return null;
  }
  return cached.value;
}

export function invalidateOwnerHubOrderCountsCache(storeId?: string): void {
  if (!storeId?.trim()) {
    cached = null;
    return;
  }
  if (cached?.storeId === storeId.trim()) cached = null;
}

export function ownerHubOrderAlertsFromMeta(meta: {
  pending_accept_count: number;
  refund_requested_count: number;
}): number {
  return Math.max(0, meta.pending_accept_count) + Math.max(0, meta.refund_requested_count);
}
