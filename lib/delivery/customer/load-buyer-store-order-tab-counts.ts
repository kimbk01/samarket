import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberOrderTab } from "@/lib/member-orders/types";
import { countMemberOrderTabs } from "@/lib/member-orders/member-order-tab-status";

/**
 * 내 주문 탭 개수 — 목록과 같이 「목록에서 숨긴 주문」은 제외하고 전체 주문으로 센다.
 * 목록은 100건씩(커서) 불러오므로 화면에서 센 개수는 더 불러오기 전까지 일부만 반영된다.
 */
export async function loadBuyerStoreOrderTabCounts(
  sb: SupabaseClient,
  buyerId: string
): Promise<{ ok: true; counts: Record<MemberOrderTab, number> } | { ok: false; error: string }> {
  const [ordersRes, hidesRes] = await Promise.all([
    sb.from("store_orders").select("id, order_status").eq("buyer_user_id", buyerId),
    sb.from("store_order_buyer_hides").select("order_id").eq("buyer_user_id", buyerId),
  ]);
  if (ordersRes.error) return { ok: false, error: "tab_counts_failed" };
  const hidden = new Set(
    hidesRes.error ? [] : ((hidesRes.data ?? []) as Array<{ order_id: string }>).map((h) => h.order_id)
  );
  const statuses = ((ordersRes.data ?? []) as Array<{ id: string; order_status: string | null }>)
    .filter((o) => !hidden.has(o.id))
    .map((o) => String(o.order_status ?? ""));
  return { ok: true, counts: countMemberOrderTabs(statuses) };
}
