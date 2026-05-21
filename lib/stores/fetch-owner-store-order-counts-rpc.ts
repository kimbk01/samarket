import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderCountsColdBreakdown } from "@/lib/stores/order-counts-cold-breakdown";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { fetchStoreOpsMetaForOwner } from "@/lib/stores/owner-store-ops-queries";
import { pickOrderCountsSlowestStage } from "@/lib/stores/order-counts-cold-breakdown";

export const OWNER_STORE_OPS_SNAPSHOT_COUNTS_RPC = "get_owner_store_ops_snapshot_counts";

function n(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function money(v: unknown): number {
  return Math.max(0, Math.round(Number(v) || 0));
}

export function mapRpcSnapshotCounts(data: unknown): Omit<OwnerStoreOpsSnapshot, "store_ops"> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const flow_completed_today_count = n(d.flow_completed_today_count);
  const today_completed_sales_amount = money(d.today_completed_sales_amount);
  return {
    refund_requested_count: n(d.refund_requested_count),
    pending_accept_count: n(d.pending_accept_count),
    pending_delivery_count: n(d.pending_delivery_count),
    in_progress_count: n(d.in_progress_count),
    today_completed_sales_amount,
    open_inquiries_count: n(d.open_inquiries_count),
    sold_out_product_count: n(d.sold_out_product_count),
    pending_over_3m_count: n(d.pending_over_3m_count),
    cooking_delay_count: n(d.cooking_delay_count),
    delivery_delay_count: n(d.delivery_delay_count),
    rider_unassigned_count: n(d.rider_unassigned_count),
    flow_waiting_count: n(d.flow_waiting_count),
    flow_cooking_count: n(d.flow_cooking_count),
    flow_delivering_count: n(d.flow_delivering_count),
    flow_completed_today_count,
    flow_cooking_delayed_count: n(d.flow_cooking_delayed_count),
    flow_delivering_delayed_count: n(d.flow_delivering_delayed_count),
    today_order_count: n(d.today_order_count),
    yesterday_completed_sales_amount: money(d.yesterday_completed_sales_amount),
    today_cancelled_count: n(d.today_cancelled_count),
    avg_order_value_today:
      flow_completed_today_count > 0
        ? Math.round(today_completed_sales_amount / flow_completed_today_count)
        : 0,
    reviews_need_reply_count: n(d.reviews_need_reply_count),
    active_dispute_count: n(d.active_dispute_count),
    hidden_product_count: n(d.hidden_product_count),
    sale_suspended_product_count: n(d.sale_suspended_product_count),
    option_error_product_count: 0,
    option_error_health_available: false,
  };
}

/** 단일 RPC + store_ops meta 1회 — legacy ~20 count RTT 폴백 */
export async function fetchOwnerStoreOrderCountsViaRpc(
  sb: SupabaseClient<any>,
  storeId: string,
  breakdown?: OrderCountsColdBreakdown
): Promise<{ snapshot: OwnerStoreOpsSnapshot; via: "rpc" } | null> {
  const sid = storeId.trim();
  if (!sid) return null;
  const rpc0 = Date.now();
  const { data, error } = await sb.rpc(OWNER_STORE_OPS_SNAPSHOT_COUNTS_RPC, {
    p_store_id: sid,
  });
  const rpcMs = Date.now() - rpc0;
  if (breakdown) breakdown.rpc_wall_ms = rpcMs;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- RPC deploy probe
      console.warn("[owner-store-ops-counts-rpc-miss]", error.message, { rpc_ms: rpcMs, store_id: sid });
    }
    return null;
  }
  const parse0 = Date.now();
  const mapped = mapRpcSnapshotCounts(data);
  if (breakdown) breakdown.rpc_parse_ms = Date.now() - parse0;
  if (!mapped) return null;
  const meta0 = Date.now();
  const store_ops = await fetchStoreOpsMetaForOwner(sb, sid);
  if (breakdown) {
    breakdown.store_ops_meta_ms = Date.now() - meta0;
    breakdown.order_counts_slowest_stage = pickOrderCountsSlowestStage(breakdown);
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- RPC path verify (owner dashboard)
    console.info("[owner-store-ops-counts-rpc-hit]", { store_id: sid, rpc_ms: rpcMs });
  }
  return {
    via: "rpc",
    snapshot: { ...mapped, store_ops },
  };
}
