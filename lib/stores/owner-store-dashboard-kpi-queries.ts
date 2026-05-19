import type { SupabaseClient } from "@supabase/supabase-js";

/** `BusinessAdminDashboard` 「진행 중」— `refund_requested`·`pending` 제외, 주문 관리 진행 탭과 동일 계열 */
const DASHBOARD_IN_PROGRESS_STATUSES = [
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
] as const;

function startOfLocalDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function countInProgressOrdersForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .in("order_status", [...DASHBOARD_IN_PROGRESS_STATUSES]);
  if (error) {
    console.error("[countInProgressOrdersForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

/** 완료 주문 — `updated_at` 기준 당일 매출 합(주문 관리 「오늘 완료」와 동일 계열) */
export async function sumTodayCompletedSalesForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { data, error } = await sb
    .from("store_orders")
    .select("payment_amount")
    .eq("store_id", sid)
    .eq("order_status", "completed")
    .gte("updated_at", startOfLocalDayIso());
  if (error) {
    console.error("[sumTodayCompletedSalesForStore]", error);
    return 0;
  }
  let sum = 0;
  for (const row of data ?? []) {
    sum += Math.round(Number((row as { payment_amount?: unknown }).payment_amount) || 0);
  }
  return Math.max(0, sum);
}

export async function countSoldOutProductsForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("product_status", "sold_out");
  if (error) {
    console.error("[countSoldOutProductsForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countOpenInquiriesForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("status", "open");
  if (error) {
    if (/store_inquiries/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
      return 0;
    }
    console.error("[countOpenInquiriesForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}
