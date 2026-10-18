/**
 * Admin order operations reader — `admin_store_order_ops_page` / `admin_store_order_ops_summary`.
 * Maps only; computes no status or money.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_ORDER_OPS_PAGE_RPC,
  ADMIN_ORDER_OPS_SCREEN,
  ADMIN_ORDER_OPS_SUMMARY_RPC,
  adminOrderOpsRpcArgs,
  resolveAdminOrderOpsPeriod,
  type AdminOrderOpsPageResult,
  type AdminOrderOpsPeriod,
  type AdminOrderOpsQuery,
  type AdminOrderOpsRow,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import type { StoreCommissionRowState } from "@/lib/stores/commission/store-commission-contract";

export type AdminOrderOpsOutcome<T> = { ok: true; result: T } | { ok: false; error: "rpc_missing" | "query_failed"; message: string };

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

function isRpcMissing(message: string, rpc: string): boolean {
  const m = message.toLowerCase();
  return m.includes(rpc) && (m.includes("could not find the function") || m.includes("does not exist"));
}

export function mapAdminOrderOpsRow(raw: Record<string, unknown>): AdminOrderOpsRow {
  return {
    id: str(raw.id),
    order_no: str(raw.order_no),
    store_id: str(raw.store_id),
    store_name: str(raw.store_name),
    buyer_user_id: str(raw.buyer_user_id),
    buyer_label: str(raw.buyer_label),
    fulfillment_type: str(raw.fulfillment_type),
    order_status: str(raw.order_status),
    payment_status: str(raw.payment_status),
    buyer_payment_method: strOrNull(raw.buyer_payment_method),
    total_amount: num(raw.total_amount),
    payment_amount: num(raw.payment_amount),
    discount_amount: num(raw.discount_amount),
    gift_amount: num(raw.gift_amount),
    gift_reversed: raw.gift_reversed === true,
    money_mismatch: raw.money_mismatch === true,
    created_at: str(raw.created_at),
    basis_at: str(raw.basis_at) || str(raw.created_at),
    completed_at: strOrNull(raw.completed_at),
    sla_warning_level: strOrNull(raw.sla_warning_level),
    sla_warning_reason: strOrNull(raw.sla_warning_reason),
    admin_locked: raw.admin_locked === true,
    dispute_status: strOrNull(raw.dispute_status),
    needs_admin_attention: raw.needs_admin_attention === true,
    delivery_status: strOrNull(raw.delivery_status),
    rider_failure_reported_at: strOrNull(raw.rider_failure_reported_at),
    first_title: strOrNull(raw.first_title),
    line_count: num(raw.line_count),
    qty_total: num(raw.qty_total),
    cancel_requested_at: strOrNull(raw.cancel_requested_at),
    cancelled_at: strOrNull(raw.cancelled_at),
    refund_requested_at: strOrNull(raw.refund_requested_at),
    refunded_at: strOrNull(raw.refunded_at),
    cancel_requested_role: strOrNull(raw.cancel_requested_role),
    cancel_reason: strOrNull(raw.cancel_reason),
    cancel_request_status: strOrNull(raw.cancel_request_status),
    cancel_decided_at: strOrNull(raw.cancel_decided_at),
    cancel_rejected_reason: strOrNull(raw.cancel_rejected_reason),
    refund_requested_role: strOrNull(raw.refund_requested_role),
    refund_reason: strOrNull(raw.refund_reason),
    decided_role: strOrNull(raw.decided_role),
    commission_state: (strOrNull(raw.commission_state) as StoreCommissionRowState | null) ?? null,
  };
}

export async function loadAdminOrderOpsPage(
  sb: SupabaseClient,
  q: AdminOrderOpsQuery
): Promise<AdminOrderOpsOutcome<AdminOrderOpsPageResult>> {
  const { data, error } = await sb.rpc(ADMIN_ORDER_OPS_PAGE_RPC, adminOrderOpsRpcArgs(q));
  if (error) {
    const message = error.message ?? "query_failed";
    return { ok: false, error: isRpcMissing(message, ADMIN_ORDER_OPS_PAGE_RPC) ? "rpc_missing" : "query_failed", message };
  }
  const o = (data ?? {}) as Record<string, unknown>;
  const countsRaw = (o.tab_counts ?? {}) as Record<string, unknown>;
  const tabCounts = Object.fromEntries(ADMIN_ORDER_OPS_SCREEN[q.screen].tabs.map((t) => [t.key, num(countsRaw[t.key])]));
  return {
    ok: true,
    result: {
      asOf: str(o.as_of) || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      total: num(o.total),
      page: q.page,
      pageSize: q.pageSize,
      tabCounts,
      rows: Array.isArray(o.rows) ? (o.rows as Record<string, unknown>[]).map(mapAdminOrderOpsRow) : [],
    },
  };
}

export async function loadAdminOrderOpsSummary(
  sb: SupabaseClient,
  input: { scope: "orders" | "cancel" | "refund"; period: AdminOrderOpsPeriod; fromDay: string | null; toDay: string | null; storeId: string | null }
): Promise<AdminOrderOpsOutcome<Record<string, unknown>>> {
  const range = resolveAdminOrderOpsPeriod(input.period, input.fromDay, input.toDay);
  const { data, error } = await sb.rpc(ADMIN_ORDER_OPS_SUMMARY_RPC, {
    p_scope: input.scope,
    p_from: range.fromIso,
    p_to: range.toIso,
    p_store_id: input.storeId,
  });
  if (error) {
    const message = error.message ?? "query_failed";
    return { ok: false, error: isRpcMissing(message, ADMIN_ORDER_OPS_SUMMARY_RPC) ? "rpc_missing" : "query_failed", message };
  }
  return { ok: true, result: (data ?? {}) as Record<string, unknown> };
}
