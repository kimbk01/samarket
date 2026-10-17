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

/** Recent commission charges (store_sale_fee_obligations — commission SSOT, CASH minor units). */
export type BusinessCcKpiRecentCommission = {
  id: string;
  orderId: string;
  feeDueMinor: number;
  feeOutstandingMinor: number;
  adjustmentStatus: string;
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
  recentCommissions: BusinessCcKpiRecentCommission[];
  /** Commission attention counts — legacy store_settlements snapshots are not counted (store-collected money). */
  commissionCounts: {
    charged: number;
    outstanding: number;
    reviewRequired: number;
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

async function countWhere(
  sb: SupabaseClient,
  storeId: string,
  where: (q: any) => any
): Promise<number> {
  const { count, error } = await where(
    sb.from("store_sale_fee_obligations").select("id", { count: "exact", head: true }).eq("store_id", storeId)
  );
  if (error) {
    if (/does not exist/i.test(String(error.message))) return 0;
    console.error("[business-cc-kpi] store_sale_fee_obligations", error.message);
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
    recentCommissions: [],
    commissionCounts: { charged: 0, outstanding: 0, reviewRequired: 0 },
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
    feeCharged,
    feeOutstanding,
    feeReview,
    recentCommissionsRes,
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
    countWhere(sb, sid, (q) => q.gt("fee_due_minor", 0)),
    countWhere(sb, sid, (q) => q.gt("fee_outstanding_minor", 0)),
    countEq(sb, "store_sale_fee_obligations", sid, "adjustment_status", "review_required"),
    sb
      .from("store_sale_fee_obligations")
      .select("id, order_id, fee_due_minor, fee_outstanding_minor, adjustment_status, created_at")
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

  const recentCommissions: BusinessCcKpiRecentCommission[] = (recentCommissionsRes.data ?? []).map(
    (r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      orderId: String(r.order_id ?? ""),
      feeDueMinor: Math.trunc(Number(r.fee_due_minor) || 0),
      feeOutstandingMinor: Math.trunc(Number(r.fee_outstanding_minor) || 0),
      adjustmentStatus: String(r.adjustment_status ?? "none"),
      createdAt: String(r.created_at ?? ""),
    })
  );

  if (recentCommissionsRes.error) {
    if (!/does not exist/i.test(String(recentCommissionsRes.error.message))) {
      console.error("[business-cc-kpi] recent commissions", recentCommissionsRes.error.message);
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
    recentCommissions,
    commissionCounts: {
      charged: feeCharged,
      outstanding: feeOutstanding,
      reviewRequired: feeReview,
    },
    openReportCount: openReports,
    reviewCount: base.reviewCount,
    hiddenReviewCount: hiddenReviews,
  };
}
