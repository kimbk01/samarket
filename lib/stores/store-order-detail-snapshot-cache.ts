/**
 * SOD1 store order detail snapshot invalidation.
 */
import { scheduleStoreOrderDetailSnapshotRefresh } from "@/lib/stores/store-order-detail-snapshot-refresh";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const invalidatedKeys = new Set<string>();

function key(orderId: string, viewerUserId?: string): string {
  const oid = orderId.trim();
  const uid = viewerUserId?.trim() ?? "*";
  return `${oid}:${uid}`;
}

async function scheduleRefreshForOrder(orderId: string): Promise<void> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return;
  const { data } = await sb
    .from("store_orders")
    .select("buyer_user_id")
    .eq("id", orderId.trim())
    .maybeSingle();
  const buyerId = String((data as { buyer_user_id?: string } | null)?.buyer_user_id ?? "").trim();
  if (buyerId) scheduleStoreOrderDetailSnapshotRefresh(orderId, buyerId);
}

export function invalidateStoreOrderDetailSnapshot(
  orderId: string,
  viewerUserId?: string,
  reason?: string
): void {
  const oid = orderId.trim();
  if (!oid) return;
  if (viewerUserId?.trim()) {
    const k = key(oid, viewerUserId);
    invalidatedKeys.add(k);
    scheduleStoreOrderDetailSnapshotRefresh(oid, viewerUserId.trim());
  } else {
    invalidatedKeys.add(key(oid, "*"));
    void scheduleRefreshForOrder(oid);
    if (process.env.NODE_ENV === "development" && reason) {
      // eslint-disable-next-line no-console -- invalidation probe
      console.log("[store-order-detail-snapshot-invalidate-order]", { order_id: oid, reason });
    }
  }
}

export function peekStoreOrderDetailSnapshotInvalidated(
  orderId: string,
  viewerUserId: string
): boolean {
  const k = key(orderId, viewerUserId);
  return invalidatedKeys.has(k) || invalidatedKeys.has(key(orderId, "*"));
}

export function clearStoreOrderDetailSnapshotInvalidation(
  orderId: string,
  viewerUserId: string
): void {
  invalidatedKeys.delete(key(orderId, viewerUserId));
}
