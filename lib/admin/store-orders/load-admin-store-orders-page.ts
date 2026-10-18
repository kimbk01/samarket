/**
 * Admin store orders page reader — one RPC (`admin_store_orders_page`) for rows, total and
 * tab counts under the same WHERE. This module only maps; it computes no status or money.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_STORE_ORDERS_PAGE_RPC,
  ADMIN_STORE_ORDERS_TABS,
  adminStoreOrderIntegrityFlags,
  adminStoreOrdersRpcArgs,
  type AdminStoreOrderListRow,
  type AdminStoreOrdersPageResult,
  type AdminStoreOrdersQuery,
  type AdminStoreOrdersTab,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import type { StoreCommissionRowState } from "@/lib/stores/commission/store-commission-contract";

export type LoadAdminStoreOrdersPageOutcome =
  | { ok: true; result: AdminStoreOrdersPageResult }
  | { ok: false; error: "rpc_missing" | "query_failed"; message: string };

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

function isRpcMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes(ADMIN_STORE_ORDERS_PAGE_RPC) &&
    (m.includes("could not find the function") || m.includes("does not exist"))
  );
}

export function mapAdminStoreOrderRow(raw: Record<string, unknown>): AdminStoreOrderListRow {
  const base = {
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
    gift_redemption_amount: num(raw.gift_redemption_amount),
    created_at: str(raw.created_at),
    completed_at: strOrNull(raw.completed_at),
    sla_warning_level: strOrNull(raw.sla_warning_level),
    admin_locked: raw.admin_locked === true,
    dispute_status: strOrNull(raw.dispute_status),
    delivery_status: strOrNull(raw.delivery_status),
    first_title: strOrNull(raw.first_title),
    line_count: num(raw.line_count),
    qty_total: num(raw.qty_total),
    commission_state: (strOrNull(raw.commission_state) as StoreCommissionRowState | null) ?? null,
  };
  return { ...base, integrity_flags: adminStoreOrderIntegrityFlags(base) };
}

export async function loadAdminStoreOrdersPage(
  sb: SupabaseClient,
  q: AdminStoreOrdersQuery
): Promise<LoadAdminStoreOrdersPageOutcome> {
  const { data, error } = await sb.rpc(ADMIN_STORE_ORDERS_PAGE_RPC, adminStoreOrdersRpcArgs(q));
  if (error) {
    const message = error.message ?? "query_failed";
    return { ok: false, error: isRpcMissing(message) ? "rpc_missing" : "query_failed", message };
  }
  const o = (data ?? {}) as Record<string, unknown>;
  const countsRaw = (o.tab_counts ?? {}) as Record<string, unknown>;
  const tabCounts = Object.fromEntries(
    ADMIN_STORE_ORDERS_TABS.map((t) => [t, num(countsRaw[t])])
  ) as Record<AdminStoreOrdersTab, number>;
  const rows = Array.isArray(o.rows) ? (o.rows as Record<string, unknown>[]).map(mapAdminStoreOrderRow) : [];
  return {
    ok: true,
    result: {
      asOf: str(o.as_of) || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      total: num(o.total),
      page: q.page,
      pageSize: q.pageSize,
      tabCounts,
      rows,
    },
  };
}
