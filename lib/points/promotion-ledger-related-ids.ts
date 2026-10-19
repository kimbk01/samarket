/**
 * 홍보 주문(point_promotion_orders) ↔ 포인트 원장 연결 (거래 Admin 설계 v2 §G-2 · D-30). 서버 전용.
 * 원장 related_type='promotion_order' 의 related_id 형식이 경로마다 다르다:
 *   즉시 구매·환급 `{order}` · 승인형 보류 `hold:{order}` · 승인 확정 `capture:{order}` · 반려 해제 `release:{holdId}`
 * 도메인(거래·커뮤니티)별 원장 조회는 이 목록으로 걸러야 보류·확정·해제 행이 빠지지 않는다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadPromotionLedgerRelatedIds(
  sb: SupabaseClient,
  domain: "trade" | "community",
  cap = 500
): Promise<{ ok: true; relatedIds: string[]; capped: boolean } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("id")
    .eq("domain", domain)
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) return { ok: false, error: error.message };
  const orderIds = ((data ?? []) as { id: string }[]).map((r) => String(r.id));
  const relatedIds = orderIds.flatMap((id) => [id, `hold:${id}`, `capture:${id}`]);
  if (orderIds.length) {
    const { data: holds, error: hErr } = await sb
      .from("promotion_point_holds")
      .select("id")
      .in("promotion_order_id", orderIds);
    if (hErr) return { ok: false, error: hErr.message };
    for (const h of (holds ?? []) as { id: string }[]) relatedIds.push(`release:${h.id}`);
  }
  return { ok: true, relatedIds, capped: orderIds.length >= cap };
}

/** PostgREST in.(…) 값 — `:` 가 들어가므로 큰따옴표로 감싼다 */
export function postgrestInList(values: string[]): string {
  return values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
}
