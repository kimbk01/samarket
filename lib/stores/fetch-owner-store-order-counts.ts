import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countPendingAcceptForStore,
  countPendingDeliveryAcceptForStore,
} from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";

export type OwnerStoreOrderCounts = {
  refund_requested_count: number;
  pending_accept_count: number;
  pending_delivery_count: number;
};

/** count-only — 목록·join 없음 */
export async function fetchOwnerStoreOrderCounts(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<OwnerStoreOrderCounts> {
  const [refund_requested_count, pending_accept_count, pending_delivery_count] = await Promise.all([
    countRefundRequestedForStore(sb, storeId),
    countPendingAcceptForStore(sb, storeId),
    countPendingDeliveryAcceptForStore(sb, storeId),
  ]);
  return { refund_requested_count, pending_accept_count, pending_delivery_count };
}
