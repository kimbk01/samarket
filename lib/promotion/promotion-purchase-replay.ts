import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 재감사 R-04 (2026-11-04 · P0 금전 재판정): 같은 결제 요청 키로 다시 온 요청은 **가격 비교보다 먼저** 처음 결과를 돌려준다.
 *
 * 예전 순서: 가격 비교 → (DB) 키 확인. 첫 결제가 서버에서 끝난 뒤 응답이 끊기고 그사이 가격이 바뀌면
 * 같은 키 재전송이 409 `price_changed`(4xx) 가 되어 화면이 키를 버렸다 → 다음 누름 = 새 결제(연장으로 두 번째 차감).
 *
 * DB 결제 함수(`purchase_member_*_promotion`)와 같은 두 곳을 본다:
 * - 새 주문: `point_promotion_orders.idempotency_key` (본인 주문)
 * - 연장: `point_ledger` `related_type='promotion_order'` · `entry_type='promotion_extend'` · 같은 키 (본인 원장)
 * 읽기만 한다. 결과가 없으면 null → 평소 결제 흐름.
 */
export type PromotionPurchaseReplay = {
  orderId: string;
  extended: boolean;
  status: string;
  startAt: string | null;
  endAt: string | null;
  productId: string | null;
  pointCost: number | null;
  domain: string | null;
};

export async function findPromotionPurchaseReplay(
  sb: SupabaseClient,
  userId: string,
  idempotencyKey: string
): Promise<PromotionPurchaseReplay | null> {
  const key = idempotencyKey.trim();
  if (!key || !userId) return null;

  const { data: order } = await sb
    .from("point_promotion_orders")
    .select("id, order_status, start_at, end_at, product_id, point_cost, domain")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .limit(1)
    .maybeSingle();
  if (order) {
    const o = order as Record<string, unknown>;
    return {
      orderId: String(o.id),
      extended: false,
      status: String(o.order_status ?? "active"),
      startAt: o.start_at != null ? String(o.start_at) : null,
      endAt: o.end_at != null ? String(o.end_at) : null,
      productId: o.product_id != null ? String(o.product_id) : null,
      pointCost: o.point_cost != null ? Number(o.point_cost) : null,
      domain: o.domain != null ? String(o.domain) : null,
    };
  }

  const { data: ext } = await sb
    .from("point_ledger")
    .select("related_id")
    .eq("user_id", userId)
    .eq("related_type", "promotion_order")
    .eq("entry_type", "promotion_extend")
    .eq("idempotency_key", key)
    .limit(1)
    .maybeSingle();
  const extOrderId = ext ? String((ext as { related_id?: unknown }).related_id ?? "") : "";
  if (!extOrderId) return null;
  const { data: extOrder } = await sb
    .from("point_promotion_orders")
    .select("id, order_status, start_at, end_at, product_id, point_cost, domain")
    .eq("id", extOrderId)
    .maybeSingle();
  const e = (extOrder ?? {}) as Record<string, unknown>;
  return {
    orderId: extOrderId,
    extended: true,
    status: String(e.order_status ?? "active"),
    startAt: e.start_at != null ? String(e.start_at) : null,
    endAt: e.end_at != null ? String(e.end_at) : null,
    productId: e.product_id != null ? String(e.product_id) : null,
    pointCost: e.point_cost != null ? Number(e.point_cost) : null,
    domain: e.domain != null ? String(e.domain) : null,
  };
}
