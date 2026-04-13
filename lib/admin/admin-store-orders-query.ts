import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidOrderStatus } from "@/lib/stores/order-status-transitions";

export type AdminStoreOrderRow = {
  id: string;
  order_no: string;
  store_id: string;
  buyer_user_id: string;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  created_at: string;
  store_name: string;
};

const PAYMENT_STATUS_FILTER = new Set([
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

/** ilike 패턴 특수문자 제거 (와일드카드 주입 방지) */
export function adminOrdersSafeIlike(s: string) {
  return s.replace(/[%_\\]/g, "");
}

export function adminOrdersClampLimit(raw: string | null, fallback: number, cap: number) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(cap, Math.max(1, n));
}

/**
 * 관리자 주문 목록/CSV 공통 조회 (필터 동일)
 * @param maxLimit — UI 목록은 300, CSV는 더 크게 허용 가능
 */
export async function fetchAdminStoreOrders(
  sb: SupabaseClient,
  searchParams: URLSearchParams,
  options: { defaultLimit: number; maxLimit: number }
): Promise<{ ok: true; orders: AdminStoreOrderRow[] } | { ok: false; error: string }> {
  const orderId = searchParams.get("order_id")?.trim() || null;
  const orderNoRaw = searchParams.get("order_no")?.trim() || null;
  const storeIdRaw = searchParams.get("store_id")?.trim() || null;
  const buyerUserIdRaw = searchParams.get("buyer_user_id")?.trim() || null;
  const paymentStatusRaw = searchParams.get("payment_status")?.trim() || null;
  const orderStatusRaw = searchParams.get("order_status")?.trim() || null;
  const limit = adminOrdersClampLimit(
    searchParams.get("limit"),
    options.defaultLimit,
    options.maxLimit
  );

  let q = sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, buyer_user_id, payment_amount, payment_status, order_status, fulfillment_type, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orderId) q = q.eq("id", orderId);
  if (storeIdRaw) q = q.eq("store_id", storeIdRaw);
  if (buyerUserIdRaw) q = q.eq("buyer_user_id", buyerUserIdRaw);
  const orderNo = orderNoRaw ? adminOrdersSafeIlike(orderNoRaw) : "";
  if (orderNo) q = q.ilike("order_no", `%${orderNo}%`);
  if (paymentStatusRaw && PAYMENT_STATUS_FILTER.has(paymentStatusRaw)) {
    q = q.eq("payment_status", paymentStatusRaw);
  }
  if (orderStatusRaw && isValidOrderStatus(orderStatusRaw)) {
    q = q.eq("order_status", orderStatusRaw);
  }

  const { data: orders, error } = await q;

  if (error) {
    console.error("[fetchAdminStoreOrders]", error);
    return { ok: false, error: error.message };
  }

  const list = orders ?? [];
  const storeIds = [...new Set(list.map((o) => o.store_id as string))];
  const storeById: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) storeById[s.id as string] = (s.store_name as string) ?? "";
  }

  return {
    ok: true,
    orders: list.map((o) => ({
      id: o.id as string,
      order_no: o.order_no as string,
      store_id: o.store_id as string,
      buyer_user_id: o.buyer_user_id as string,
      payment_amount: Number(o.payment_amount) || 0,
      payment_status: o.payment_status as string,
      order_status: o.order_status as string,
      fulfillment_type: o.fulfillment_type as string,
      created_at: o.created_at as string,
      store_name: storeById[o.store_id as string] ?? "",
    })),
  };
}
