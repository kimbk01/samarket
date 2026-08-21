/**
 * Business Control Center KPI — read-only aggregates from existing tables.
 * No separate truth/cache/table. Reuses Owner KPI helpers where they already match.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countInProgressOrdersForStore,
  countSoldOutProductsForStore,
} from "@/lib/stores/owner-store-dashboard-kpi-queries";

export type BusinessCcKpiRecentOrder = {
  id: string;
  orderNo: string;
  orderStatus: string;
  paymentAmount: number;
  createdAt: string;
};

export type BusinessCcKpiRecentSettlement = {
  id: string;
  settlementStatus: string;
  netAmount: number | null;
  createdAt: string;
};

export type BusinessCcKpiSummary = {
  inProgressOrderCount: number;
  orderStatusCounts: {
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    refundRequested: number;
  };
  recentOrders: BusinessCcKpiRecentOrder[];
  soldOutProductCount: number;
  productCount: number;
  recentSettlements: BusinessCcKpiRecentSettlement[];
  settlementStatusCounts: {
    pending: number;
    processing: number;
    held: number;
    paid: number;
    cancelled: number;
  };
  openReportCount: number;
  reviewCount: number;
  hiddenReviewCount: number;
};

async function countEq(
  sb: SupabaseClient,
  table: string,
  storeId: string,
  column: string,
  value: string
): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq(column, value);
  if (error) {
    if (/does not exist/i.test(String(error.message))) return 0;
    console.error(`[business-cc-kpi] ${table}.${column}=${value}`, error.message);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function loadBusinessCcKpiSummary(
  sb: SupabaseClient,
  storeId: string,
  base: { productCount: number; reviewCount: number }
): Promise<BusinessCcKpiSummary> {
  const sid = storeId.trim();
  const empty: BusinessCcKpiSummary = {
    inProgressOrderCount: 0,
    orderStatusCounts: {
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      refundRequested: 0,
    },
    recentOrders: [],
    soldOutProductCount: 0,
    productCount: base.productCount,
    recentSettlements: [],
    settlementStatusCounts: {
      pending: 0,
      processing: 0,
      held: 0,
      paid: 0,
      cancelled: 0,
    },
    openReportCount: 0,
    reviewCount: base.reviewCount,
    hiddenReviewCount: 0,
  };
  if (!sid) return empty;

  const [
    inProgress,
    soldOut,
    pendingOrders,
    completedOrders,
    cancelledOrders,
    refundRequested,
    recentOrdersRes,
    settlePending,
    settleProcessing,
    settleHeld,
    settlePaid,
    settleCancelled,
    recentSettlementsRes,
    openReports,
    hiddenReviews,
  ] = await Promise.all([
    countInProgressOrdersForStore(sb, sid),
    countSoldOutProductsForStore(sb, sid),
    countEq(sb, "store_orders", sid, "order_status", "pending"),
    countEq(sb, "store_orders", sid, "order_status", "completed"),
    countEq(sb, "store_orders", sid, "order_status", "cancelled"),
    countEq(sb, "store_orders", sid, "order_status", "refund_requested"),
    sb
      .from("store_orders")
      .select("id, order_no, order_status, payment_amount, created_at")
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .limit(5),
    countEq(sb, "store_settlements", sid, "settlement_status", "pending"),
    countEq(sb, "store_settlements", sid, "settlement_status", "processing"),
    countEq(sb, "store_settlements", sid, "settlement_status", "held"),
    countEq(sb, "store_settlements", sid, "settlement_status", "paid"),
    countEq(sb, "store_settlements", sid, "settlement_status", "cancelled"),
    sb
      .from("store_settlements")
      .select("id, settlement_status, net_settlement_amount, settlement_amount, created_at")
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .limit(3),
    countEq(sb, "store_reports", sid, "status", "open"),
    countEq(sb, "store_reviews", sid, "status", "hidden"),
  ]);

  const recentOrders: BusinessCcKpiRecentOrder[] = (recentOrdersRes.data ?? []).map(
    (r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      orderNo: String(r.order_no ?? ""),
      orderStatus: String(r.order_status ?? ""),
      paymentAmount: Math.round(Number(r.payment_amount) || 0),
      createdAt: String(r.created_at ?? ""),
    })
  );

  if (recentOrdersRes.error) {
    console.error("[business-cc-kpi] recent orders", recentOrdersRes.error.message);
  }

  const recentSettlements: BusinessCcKpiRecentSettlement[] = (
    recentSettlementsRes.data ?? []
  ).map((r: Record<string, unknown>) => {
    const netRaw =
      r.net_settlement_amount != null && r.net_settlement_amount !== ""
        ? r.net_settlement_amount
        : r.settlement_amount;
    return {
      id: String(r.id ?? ""),
      settlementStatus: String(r.settlement_status ?? ""),
      netAmount:
        netRaw == null || netRaw === "" ? null : Math.round(Number(netRaw) || 0),
      createdAt: String(r.created_at ?? ""),
    };
  });

  if (recentSettlementsRes.error) {
    if (!/does not exist/i.test(String(recentSettlementsRes.error.message))) {
      console.error("[business-cc-kpi] recent settlements", recentSettlementsRes.error.message);
    }
  }

  return {
    inProgressOrderCount: inProgress,
    orderStatusCounts: {
      pending: pendingOrders,
      inProgress,
      completed: completedOrders,
      cancelled: cancelledOrders,
      refundRequested,
    },
    recentOrders,
    soldOutProductCount: soldOut,
    productCount: base.productCount,
    recentSettlements,
    settlementStatusCounts: {
      pending: settlePending,
      processing: settleProcessing,
      held: settleHeld,
      paid: settlePaid,
      cancelled: settleCancelled,
    },
    openReportCount: openReports,
    reviewCount: base.reviewCount,
    hiddenReviewCount: hiddenReviews,
  };
}
