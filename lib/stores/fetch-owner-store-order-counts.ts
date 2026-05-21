import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOwnerStoreOrderCountsDashboardSnapshot } from "@/lib/stores/fetch-owner-store-order-counts-dashboard-snapshot-rpc";
import { fetchOwnerStoreOrderCountsViaRpc } from "@/lib/stores/fetch-owner-store-order-counts-rpc";
import type { OrderCountsColdBreakdown } from "@/lib/stores/order-counts-cold-breakdown";
import {
  countInProgressOrdersForStore,
  countOpenInquiriesForStore,
  countSoldOutProductsForStore,
  sumTodayCompletedSalesForStore,
} from "@/lib/stores/owner-store-dashboard-kpi-queries";
import {
  countActiveDisputesForStore,
  countCookingDelayForStore,
  countDeliveryDelayForStore,
  countDraftProductsForStore,
  countFlowCompletedTodayForStore,
  countFlowCookingDelayedForStore,
  countFlowCookingForStore,
  countFlowDeliveringDelayedForStore,
  countFlowDeliveringForStore,
  countFlowWaitingForStore,
  countHiddenProductsForStore,
  countPendingOver3mForStore,
  countReviewsNeedReplyForStore,
  countRiderUnassignedForStore,
  countTodayCancelledForStore,
  countTodayOrdersForStore,
  fetchStoreOpsMetaForOwner,
  sumYesterdayCompletedSalesForStore,
} from "@/lib/stores/owner-store-ops-queries";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";

async function fetchOwnerStoreOrderCountsLegacySnapshot(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<OwnerStoreOpsSnapshot> {
  const [
    refund_requested_count,
    pending_accept_count,
    pending_delivery_count,
    in_progress_count,
    today_completed_sales_amount,
    open_inquiries_count,
    sold_out_product_count,
    pending_over_3m_count,
    cooking_delay_count,
    delivery_delay_count,
    rider_unassigned_count,
    flow_waiting_count,
    flow_cooking_count,
    flow_delivering_count,
    flow_completed_today_count,
    flow_cooking_delayed_count,
    flow_delivering_delayed_count,
    today_order_count,
    yesterday_completed_sales_amount,
    today_cancelled_count,
    reviews_need_reply_count,
    active_dispute_count,
    hidden_product_count,
    sale_suspended_product_count,
    store_ops,
  ] = await Promise.all([
    countRefundRequestedForStore(sb, storeId),
    countPendingAcceptForStore(sb, storeId),
    countPendingDeliveryAcceptForStore(sb, storeId),
    countInProgressOrdersForStore(sb, storeId),
    sumTodayCompletedSalesForStore(sb, storeId),
    countOpenInquiriesForStore(sb, storeId),
    countSoldOutProductsForStore(sb, storeId),
    countPendingOver3mForStore(sb, storeId),
    countCookingDelayForStore(sb, storeId),
    countDeliveryDelayForStore(sb, storeId),
    countRiderUnassignedForStore(sb, storeId),
    countFlowWaitingForStore(sb, storeId),
    countFlowCookingForStore(sb, storeId),
    countFlowDeliveringForStore(sb, storeId),
    countFlowCompletedTodayForStore(sb, storeId),
    countFlowCookingDelayedForStore(sb, storeId),
    countFlowDeliveringDelayedForStore(sb, storeId),
    countTodayOrdersForStore(sb, storeId),
    sumYesterdayCompletedSalesForStore(sb, storeId),
    countTodayCancelledForStore(sb, storeId),
    countReviewsNeedReplyForStore(sb, storeId),
    countActiveDisputesForStore(sb, storeId),
    countHiddenProductsForStore(sb, storeId),
    countDraftProductsForStore(sb, storeId),
    fetchStoreOpsMetaForOwner(sb, storeId),
  ]);

  const avg_order_value_today =
    flow_completed_today_count > 0
      ? Math.round(today_completed_sales_amount / flow_completed_today_count)
      : 0;

  return {
    refund_requested_count,
    pending_accept_count,
    pending_delivery_count,
    in_progress_count,
    today_completed_sales_amount,
    open_inquiries_count,
    sold_out_product_count,
    pending_over_3m_count,
    cooking_delay_count,
    delivery_delay_count,
    rider_unassigned_count,
    flow_waiting_count,
    flow_cooking_count,
    flow_delivering_count,
    flow_completed_today_count,
    flow_cooking_delayed_count,
    flow_delivering_delayed_count,
    today_order_count,
    yesterday_completed_sales_amount,
    today_cancelled_count,
    avg_order_value_today,
    reviews_need_reply_count,
    active_dispute_count,
    hidden_product_count,
    sale_suspended_product_count,
    option_error_product_count: 0,
    option_error_health_available: false,
    store_ops,
  };
}
import {
  countPendingAcceptForStore,
  countPendingDeliveryAcceptForStore,
} from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";

export type OwnerStoreOrderCounts = OwnerStoreOpsSnapshot;

export type OwnerStoreOrderCountsVia = "rpc_snapshot" | "rpc" | "legacy";

export type FetchOwnerStoreOrderCountsWithMetaResult =
  | { snapshot: OwnerStoreOrderCounts; via: OwnerStoreOrderCountsVia }
  | { gate: { ok: false; status: number; error: string } };

/** count-only — dashboard snapshot 1 RTT → rpc+meta → legacy */
export async function fetchOwnerStoreOrderCountsWithMeta(
  sb: SupabaseClient<any>,
  storeId: string,
  userId: string,
  breakdown?: OrderCountsColdBreakdown
): Promise<FetchOwnerStoreOrderCountsWithMetaResult> {
  const wall0 = Date.now();
  const dashboard = await fetchOwnerStoreOrderCountsDashboardSnapshot(sb, storeId, userId, breakdown);
  if (breakdown) {
    breakdown.order_counts_cold_parallel_wall_ms = Math.round(Date.now() - wall0);
  }
  if (dashboard) {
    if (!dashboard.ok) return { gate: dashboard };
    return { snapshot: dashboard.snapshot, via: "rpc_snapshot" };
  }

  const rpc = await fetchOwnerStoreOrderCountsViaRpc(sb, storeId, breakdown);
  if (rpc) return { snapshot: rpc.snapshot, via: "rpc" };

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- legacy fallback observability
    console.warn("[owner-store-ops-counts-legacy-fallback]", { store_id: storeId.trim() });
  }

  return { snapshot: await fetchOwnerStoreOrderCountsLegacySnapshot(sb, storeId), via: "legacy" };
}

/** order-counts 외 라우트 — ownership 은 호출측에서 이미 검증된 경우 */
export async function fetchOwnerStoreOrderCounts(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<OwnerStoreOrderCounts> {
  const rpc = await fetchOwnerStoreOrderCountsViaRpc(sb, storeId);
  if (rpc) return rpc.snapshot;
  return fetchOwnerStoreOrderCountsLegacySnapshot(sb, storeId);
}
