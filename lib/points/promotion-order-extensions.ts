/**
 * 상위노출 연장 기록 합계 (광고 DB 묶음 A-DB TB-07) — 주문 행은 처음 결제 그대로, 연장은 `point_promotion_order_extensions` 한 줄씩.
 * 내 광고·어드민 거래/커뮤니티 상위노출 목록이 같이 쓴다(1곳).
 * 조회 실패면 빈 결과 — 연장 표시만 빠지고 주문 목록은 정상(호출자가 실패를 기록하지 않음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PromotionOrderExtensionSummary = { count: number; days: number; points: number };

export async function loadPromotionOrderExtensionSummaries(
  sb: SupabaseClient,
  orderIds: readonly string[]
): Promise<Map<string, PromotionOrderExtensionSummary>> {
  const byOrder = new Map<string, PromotionOrderExtensionSummary>();
  const ids = [...new Set(orderIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return byOrder;
  const { data, error } = await sb
    .from("point_promotion_order_extensions")
    .select("order_id, days, points")
    .in("order_id", ids);
  if (error) {
    console.warn("[promotion-order-extensions] load failed", error.message);
    return byOrder;
  }
  for (const e of (data ?? []) as { order_id?: unknown; days?: unknown; points?: unknown }[]) {
    const id = String(e.order_id ?? "");
    if (!id) continue;
    const cur = byOrder.get(id) ?? { count: 0, days: 0, points: 0 };
    cur.count += 1;
    cur.days += Math.max(0, Math.floor(Number(e.days) || 0));
    cur.points += Math.max(0, Math.floor(Number(e.points) || 0));
    byOrder.set(id, cur);
  }
  return byOrder;
}
