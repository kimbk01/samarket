import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 3-C ADS-23 — 기간이 끝난 쿠폰 캠페인을 lifecycle `ended` 로 맞춘다 (DB 함수 `store_coupon_campaigns_auto_end_expired`).
 * DB 함수가 `end_at >= c_apply_from(2026-10-21 00:00 UTC)` 행만 바꾸므로 과거 행은 그대로다(D-5). 화면은 이 전이와
 * 무관하게 `effectiveCouponState` 로 이미 종료를 표시한다 — 이 배치는 lifecycle 저장값 정합용.
 * 기존 `delivery-ads-schedule-transitions` 크론에서 호출(설정 변경 없음). 실패해도 광고 배치 결과를 막지 않는다.
 */
export async function runStoreCouponAutoEndBatch(
  sb: SupabaseClient,
  limit = 500
): Promise<{ ok: true; ended: number } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("store_coupon_campaigns_auto_end_expired", { p_limit: limit });
  if (error) return { ok: false, error: error.message };
  const ended = Number((data as { ended?: unknown } | null)?.ended ?? 0);
  return { ok: true, ended: Number.isFinite(ended) ? ended : 0 };
}
