/**
 * Member Control Center — Delivery/orders tab.
 * Authority: store_orders.buyer_user_id. Amount = payment_amount column only.
 * DO NOT: client recalc, raw status UPDATE, invented status names.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_ORDER_STATUS_LIST } from "@/lib/stores/order-status-transitions";
import { asCount, asLatest, type OverviewMetric } from "@/lib/admin-users/member-tab-query";

const IN_PROGRESS = STORE_ORDER_STATUS_LIST.filter(
  (status) => status !== "completed" && status !== "cancelled" && status !== "refunded",
);

export type MemberOrdersSummary = {
  total: OverviewMetric<number>;
  inProgress: OverviewMetric<number>;
  completed: OverviewMetric<number>;
  cancelled: OverviewMetric<number>;
  refunded: OverviewMetric<number>;
  lastOrderAt: OverviewMetric<string | null>;
};

export type MemberOrderRow = {
  id: string;
  orderNo: string;
  storeId: string;
  storeName: string;
  status: string;
  paymentAmount: number | null;
  createdAt: string;
  updatedAt: string | null;
};

export type MemberOrdersTabPayload = {
  summary: MemberOrdersSummary;
  page: number;
  pageSize: number;
  total: OverviewMetric<number>;
  orders: MemberOrderRow[];
};

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

export async function loadMemberOrdersTab(
  sb: SupabaseClient,
  userId: string,
  opts: { page: number; pageSize: number; from: number; to: number },
): Promise<MemberOrdersTabPayload> {
  const uid = userId.trim();
  const [total, inProgress, completed, cancelled, refunded, lastOrderAt] = await Promise.all([
    asCount(sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", uid)),
    asCount(
      sb
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("buyer_user_id", uid)
        .in("order_status", [...IN_PROGRESS]),
    ),
    asCount(
      sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", uid).eq("order_status", "completed"),
    ),
    asCount(
      sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", uid).eq("order_status", "cancelled"),
    ),
    asCount(
      sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", uid).eq("order_status", "refunded"),
    ),
    asLatest(
      sb.from("store_orders").select("created_at").eq("buyer_user_id", uid).order("created_at", { ascending: false }).limit(1),
      "created_at",
    ),
  ]);

  const summary: MemberOrdersSummary = { total, inProgress, completed, cancelled, refunded, lastOrderAt };
  const { data, error } = await sb
    .from("store_orders")
    .select("id, order_no, store_id, order_status, payment_amount, created_at, updated_at")
    .eq("buyer_user_id", uid)
    .order("created_at", { ascending: false })
    .range(opts.from, opts.to);

  if (error) {
    return {
      summary,
      page: opts.page,
      pageSize: opts.pageSize,
      total: { ok: false, error: error.message },
      orders: [],
    };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const storeIds = [...new Set(rows.map((row) => str(row, "store_id")).filter(Boolean))];
  const storeName = new Map<string, string>();
  if (storeIds.length > 0) {
    const stores = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const store of stores.data ?? []) {
      const rec = store as { id?: string; store_name?: string | null };
      const id = String(rec.id ?? "").trim();
      if (id) storeName.set(id, String(rec.store_name ?? "").trim());
    }
  }

  return {
    summary,
    page: opts.page,
    pageSize: opts.pageSize,
    total,
    orders: rows.map((row) => {
      const storeId = str(row, "store_id");
      const amount = row.payment_amount;
      return {
        id: str(row, "id"),
        orderNo: str(row, "order_no") || str(row, "id"),
        storeId,
        storeName: storeName.get(storeId) ?? "",
        status: str(row, "order_status"),
        paymentAmount: amount == null || amount === "" ? null : Number(amount),
        createdAt: str(row, "created_at"),
        updatedAt: str(row, "updated_at") || null,
      };
    }),
  };
}
