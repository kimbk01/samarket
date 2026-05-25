/**
 * SOL1 buyer store orders list snapshot invalidation.
 */
import { scheduleBuyerStoreOrdersListSnapshotRefresh } from "@/lib/stores/buyer-store-orders-list-snapshot-refresh";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const invalidatedKeys = new Set<string>();

function key(buyerUserId: string): string {
  return buyerUserId.trim();
}

async function resolveBuyerUserIdFromOrder(orderId: string): Promise<string | null> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return null;
  const { data } = await sb
    .from("store_orders")
    .select("buyer_user_id")
    .eq("id", orderId.trim())
    .maybeSingle();
  const uid = String((data as { buyer_user_id?: string } | null)?.buyer_user_id ?? "").trim();
  return uid || null;
}

export function invalidateBuyerStoreOrdersListSnapshot(
  buyerUserId?: string,
  reason?: string
): void {
  const uid = buyerUserId?.trim();
  if (!uid) return;
  invalidatedKeys.add(key(uid));
  scheduleBuyerStoreOrdersListSnapshotRefresh(uid);
  if (process.env.NODE_ENV === "development" && reason) {
    // eslint-disable-next-line no-console -- invalidation probe
    console.log("[buyer-orders-list-snapshot-invalidate]", { buyer_user_id: uid, reason });
  }
}

export function invalidateBuyerStoreOrdersListSnapshotForOrder(
  orderId: string,
  buyerUserId?: string,
  reason?: string
): void {
  const uid = buyerUserId?.trim();
  if (uid) {
    invalidateBuyerStoreOrdersListSnapshot(uid, reason);
    return;
  }
  void resolveBuyerUserIdFromOrder(orderId).then((resolved) => {
    if (resolved) invalidateBuyerStoreOrdersListSnapshot(resolved, reason ?? "order_event");
  });
}

export function peekBuyerStoreOrdersListSnapshotInvalidated(buyerUserId: string): boolean {
  return invalidatedKeys.has(key(buyerUserId));
}

export function clearBuyerStoreOrdersListSnapshotInvalidation(buyerUserId: string): void {
  invalidatedKeys.delete(key(buyerUserId));
}
