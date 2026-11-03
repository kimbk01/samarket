import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { feedAdPoolCapacity, feedAdPoolOccupiesCampaign } from "@/lib/ads/feed-ad-pool-capacity";

/**
 * 재감사 S-1 (F-3): 피드 배너 풀 수용량을 **서버도** 지킨다 — 어드민 등록 화면·노출 위치 지도와 같은 규칙
 * (`feed-ad-pool-capacity.ts`: 위치별 3 · 종료·반려·초안·기간 지난 행은 세지 않음). 예전에는 화면만 막아서
 * 회원 신청 승인·API 직접 호출로 4개 이상이 같은 풀에 들어갈 수 있었다.
 * 같은 순간 두 건이 동시에 승인되는 경합은 막지 못한다(DB 잠금 없음) — 보고서에 남김.
 */
export async function assertFeedAdPoolCapacityAvailable(
  sb: SupabaseClient,
  placement: string,
  nowMs: number = Date.now()
): Promise<{ ok: true } | { ok: false; error: "capacity_full" | "capacity_check_failed"; httpStatus: number; used?: number; capacity?: number }> {
  const capacity = feedAdPoolCapacity(placement);
  const { data, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, status, end_at")
    .eq("placement", placement);
  if (error) return { ok: false, error: "capacity_check_failed", httpStatus: 500 };
  const used = (data ?? []).filter((r) =>
    feedAdPoolOccupiesCampaign(
      { status: String((r as { status?: unknown }).status ?? ""), endAt: ((r as { end_at?: string | null }).end_at ?? null) },
      nowMs
    )
  ).length;
  if (used >= capacity) return { ok: false, error: "capacity_full", httpStatus: 409, used, capacity };
  return { ok: true };
}
