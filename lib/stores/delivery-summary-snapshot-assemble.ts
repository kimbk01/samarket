/**
 * Parse unified delivery summary snapshot RPC payload.
 */
import {
  mapDashboardSnapshotPayload,
  type DashboardSnapshotGate,
} from "@/lib/stores/fetch-owner-store-order-counts-dashboard-snapshot-rpc";

export type DeliverySummarySnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  summary_scope?: string;
  today_sales?: number;
  pending_orders?: number;
  preparing_orders?: number;
  delivering_orders?: number;
  completed_orders?: number;
  cancelled_orders?: number;
  refund_pending?: number;
  rider_summary?: Record<string, unknown>;
  dashboard_badges?: Record<string, unknown>;
  latest_orders?: unknown[];
  owner_store_ops_snapshot?: Record<string, unknown>;
  updated_at?: string;
};

export function parseDeliverySummarySnapshotRpcData(data: unknown): DeliverySummarySnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as DeliverySummarySnapshotPayloadJson;
}

export function deliverySummaryGateFromPayload(
  payload: DeliverySummarySnapshotPayloadJson
): DashboardSnapshotGate | null {
  if (payload.ok === false) {
    const err = typeof payload.error === "string" ? payload.error : "forbidden";
    if (err === "store_not_found") return { ok: false, status: 404, error: err };
    return { ok: false, status: 403, error: err };
  }
  const nested = payload.owner_store_ops_snapshot;
  if (nested && typeof nested === "object") {
    return mapDashboardSnapshotPayload(nested);
  }
  if (payload.ok === true) {
    return mapDashboardSnapshotPayload({
      ok: true,
      ...payload,
      today_completed_sales_amount: payload.today_sales,
      pending_accept_count: payload.pending_orders,
      flow_cooking_count: payload.preparing_orders,
      flow_delivering_count: payload.delivering_orders,
      flow_completed_today_count: payload.completed_orders,
      today_cancelled_count: payload.cancelled_orders,
      refund_requested_count: payload.refund_pending,
    });
  }
  return null;
}
