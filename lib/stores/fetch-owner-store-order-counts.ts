import type { SupabaseClient } from "@supabase/supabase-js";
import { tryLoadDeliverySummarySnapshot } from "@/lib/stores/delivery-summary-snapshot";
import { fetchOwnerStoreOrderCountsViaRpc } from "@/lib/stores/fetch-owner-store-order-counts-rpc";
import type { OrderCountsColdBreakdown } from "@/lib/stores/order-counts-cold-breakdown";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";

export type OwnerStoreOrderCounts = OwnerStoreOpsSnapshot;

export type OwnerStoreOrderCountsVia = "delivery_summary_snapshot" | "rpc";

export type FetchOwnerStoreOrderCountsWithMetaResult =
  | { snapshot: OwnerStoreOrderCounts; via: OwnerStoreOrderCountsVia }
  | { gate: { ok: false; status: number; error: string } };

/** Snapshot-only order-counts — unified delivery summary RPC (LFC1-A DSA1). */
export async function fetchOwnerStoreOrderCountsWithMeta(
  sb: SupabaseClient<any>,
  storeId: string,
  userId: string,
  breakdown?: OrderCountsColdBreakdown
): Promise<FetchOwnerStoreOrderCountsWithMetaResult> {
  const wall0 = Date.now();
  const deliverySnap = await tryLoadDeliverySummarySnapshot(sb, storeId, userId, breakdown);
  if (deliverySnap) {
    if ("gate" in deliverySnap) return { gate: deliverySnap.gate };
    if (breakdown) {
      breakdown.order_counts_cold_parallel_wall_ms = Math.round(Date.now() - wall0);
    }
    return { snapshot: deliverySnap.snapshot, via: "delivery_summary_snapshot" };
  }

  if (breakdown) {
    breakdown.order_counts_cold_parallel_wall_ms = Math.round(Date.now() - wall0);
  }
  return { gate: { ok: false, status: 503, error: "snapshot_unavailable" } };
}

/** order-counts 외 라우트 — ownership 은 호출측에서 이미 검증된 경우 */
export async function fetchOwnerStoreOrderCounts(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<OwnerStoreOrderCounts> {
  const rpc = await fetchOwnerStoreOrderCountsViaRpc(sb, storeId);
  if (rpc) return rpc.snapshot;
  throw new Error("owner_store_order_counts_unavailable");
}
