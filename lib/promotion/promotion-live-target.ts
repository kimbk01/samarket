import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Owner 결정 O-3 (2026-11-03): 상세 화면 「광고」 표시 — 이 글이 지금 광고 중(유료 상위노출)인지.
 * 목록과 같은 노출 조건: 주문 active · start_at ≤ 지금 ≤ end_at (일시정지·심사 중·종료는 아님).
 * 색인 `idx_point_promotion_orders_target (target_type, target_id, order_status)` 로 1행만 읽는다. 조회 실패 = false(표시 안 함).
 */
export async function isPromotionLiveForTarget(
  sb: SupabaseClient,
  input: { targetType: "product" | "community_post"; targetId: string }
): Promise<boolean> {
  const targetId = input.targetId.trim();
  if (!targetId) return false;
  const nowIso = new Date().toISOString();
  try {
    const { data, error } = await sb
      .from("point_promotion_orders")
      .select("id")
      .eq("target_type", input.targetType)
      .eq("target_id", targetId)
      .eq("order_status", "active")
      .lte("start_at", nowIso)
      .gte("end_at", nowIso)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
