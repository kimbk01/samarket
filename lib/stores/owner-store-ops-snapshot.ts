/**
 * 매장 오너 허브 운영 스냅샷 — GET …/order-counts 확장 페이로드.
 *
 * Semantics (RPC get_owner_store_ops_snapshot_counts):
 * - pending_accept_count / flow_waiting_count: ALL pending (any day) — action queue
 * - pending_over_3m_count: pending with created_at older than 3 minutes
 * - today_order_count: orders with created_at >= start of UTC day (NOT the open queue)
 * - today_completed_sales_amount / flow_completed_today_count: completed updated today
 *
 * Therefore urgent pending can be > 0 while today_order_count is 0 when the queue
 * is historical/orphan pending. UI labels must not imply they are the same metric.
 */
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";

export type OwnerStoreOpsMeta = {
  is_open: boolean;
  prep_minutes: number | null;
  /** 카드·헤더용 "11:00 ~ 22:00" 등 */
  hours_label: string | null;
};

export type OwnerStoreOpsSnapshot = {
  refund_requested_count: number;
  pending_accept_count: number;
  pending_delivery_count: number;
  in_progress_count: number;
  today_completed_sales_amount: number;
  open_inquiries_count: number;
  sold_out_product_count: number;
  pending_over_3m_count: number;
  cooking_delay_count: number;
  delivery_delay_count: number;
  rider_unassigned_count: number;
  flow_waiting_count: number;
  flow_cooking_count: number;
  flow_delivering_count: number;
  flow_completed_today_count: number;
  flow_cooking_delayed_count: number;
  flow_delivering_delayed_count: number;
  today_order_count: number;
  yesterday_completed_sales_amount: number;
  today_cancelled_count: number;
  latest_pending_order_id: string | null;
  avg_order_value_today: number;
  reviews_need_reply_count: number;
  active_dispute_count: number;
  hidden_product_count: number;
  sale_suspended_product_count: number;
  option_error_product_count: number;
  option_error_health_available: boolean;
  store_ops: OwnerStoreOpsMeta;
};

export const EMPTY_OWNER_STORE_OPS_SNAPSHOT: OwnerStoreOpsSnapshot = {
  refund_requested_count: 0,
  pending_accept_count: 0,
  pending_delivery_count: 0,
  in_progress_count: 0,
  today_completed_sales_amount: 0,
  open_inquiries_count: 0,
  sold_out_product_count: 0,
  pending_over_3m_count: 0,
  cooking_delay_count: 0,
  delivery_delay_count: 0,
  rider_unassigned_count: 0,
  flow_waiting_count: 0,
  flow_cooking_count: 0,
  flow_delivering_count: 0,
  flow_completed_today_count: 0,
  flow_cooking_delayed_count: 0,
  flow_delivering_delayed_count: 0,
  today_order_count: 0,
  yesterday_completed_sales_amount: 0,
  today_cancelled_count: 0,
  latest_pending_order_id: null,
  avg_order_value_today: 0,
  reviews_need_reply_count: 0,
  active_dispute_count: 0,
  hidden_product_count: 0,
  sale_suspended_product_count: 0,
  option_error_product_count: 0,
  option_error_health_available: false,
  store_ops: { is_open: false, prep_minutes: null, hours_label: null },
};

function n(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function money(v: unknown): number {
  return Math.max(0, Math.round(Number(v) || 0));
}

function formatHoursLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const auto = o.auto_business_hours;
  if (!auto || typeof auto !== "object") return null;
  const a = auto as Record<string, unknown>;
  if (a.enabled !== true || a.schedule_enforced !== true) return null; // serialize 계약과 동기
  const open = typeof a.open === "string" ? a.open.trim() : "";
  const close = typeof a.close === "string" ? a.close.trim() : "";
  if (!open || !close) return null;
  return `${open} ~ ${close}`;
}

export function buildStoreOpsMetaFromRow(row: {
  is_open?: boolean | null;
  business_hours_json?: unknown;
}): OwnerStoreOpsMeta {
  const extras = parseCommerceExtrasFromHoursJson(row.business_hours_json);
  return {
    is_open: row.is_open !== false,
    prep_minutes: extras.prepMinutes,
    hours_label: formatHoursLabel(row.business_hours_json),
  };
}

export function parseOwnerStoreOpsSnapshotFromJson(json: unknown): OwnerStoreOpsSnapshot | null {
  const b = json as Record<string, unknown> | null;
  if (!b || b.ok !== true) return null;
  const storeOpsRaw = b.store_ops;
  let store_ops = EMPTY_OWNER_STORE_OPS_SNAPSHOT.store_ops;
  if (storeOpsRaw && typeof storeOpsRaw === "object") {
    const s = storeOpsRaw as Record<string, unknown>;
    store_ops = {
      is_open: s.is_open === true,
      prep_minutes:
        s.prep_minutes == null ? null : Math.max(0, Math.floor(Number(s.prep_minutes) || 0)),
      hours_label:
        typeof s.hours_label === "string" && s.hours_label.trim() ? s.hours_label.trim() : null,
    };
  }
  const todaySales = money(b.today_completed_sales_amount);
  const completedToday = n(b.flow_completed_today_count);
  const avgFromApi = money(b.avg_order_value_today);
  const avg_order_value_today =
    avgFromApi > 0 ? avgFromApi : completedToday > 0 ? Math.round(todaySales / completedToday) : 0;

  return {
    refund_requested_count: n(b.refund_requested_count),
    pending_accept_count: n(b.pending_accept_count),
    pending_delivery_count: n(b.pending_delivery_count),
    in_progress_count: n(b.in_progress_count),
    today_completed_sales_amount: todaySales,
    open_inquiries_count: n(b.open_inquiries_count),
    sold_out_product_count: n(b.sold_out_product_count),
    pending_over_3m_count: n(b.pending_over_3m_count),
    cooking_delay_count: n(b.cooking_delay_count),
    delivery_delay_count: n(b.delivery_delay_count),
    rider_unassigned_count: n(b.rider_unassigned_count),
    flow_waiting_count: n(b.flow_waiting_count),
    flow_cooking_count: n(b.flow_cooking_count),
    flow_delivering_count: n(b.flow_delivering_count),
    flow_completed_today_count: completedToday,
    flow_cooking_delayed_count: n(b.flow_cooking_delayed_count),
    flow_delivering_delayed_count: n(b.flow_delivering_delayed_count),
    today_order_count: n(b.today_order_count),
    yesterday_completed_sales_amount: money(b.yesterday_completed_sales_amount),
    today_cancelled_count: n(b.today_cancelled_count),
    latest_pending_order_id:
      typeof b.latest_pending_order_id === "string" && b.latest_pending_order_id.trim()
        ? b.latest_pending_order_id.trim()
        : null,
    avg_order_value_today,
    reviews_need_reply_count: n(b.reviews_need_reply_count),
    active_dispute_count: n(b.active_dispute_count),
    hidden_product_count: n(b.hidden_product_count),
    sale_suspended_product_count: n(b.sale_suspended_product_count),
    option_error_product_count: n(b.option_error_product_count),
    option_error_health_available: b.option_error_health_available === true,
    store_ops,
  };
}

export function salesDeltaPercent(today: number, yesterday: number): number | null {
  if (yesterday <= 0) return today > 0 ? 100 : null;
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
}

export function cancelRatePercent(cancelled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((cancelled / total) * 1000) / 10;
}
