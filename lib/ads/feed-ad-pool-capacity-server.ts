import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  feedAdPoolCapacity,
  feedAdPoolOccupiesCampaign,
  feedAdPoolTargetKey,
} from "@/lib/ads/feed-ad-pool-capacity";

/**
 * 재감사 S-1 (F-3) · 광고 S-3: 피드 배너 풀 수용량을 **서버도** 지킨다 — 어드민 등록 화면·노출 위치 지도와 같은 규칙
 * (`feed-ad-pool-capacity.ts`: 풀별 3 · 종료·반려·초안·기간 지난 행은 세지 않음 · 풀 = 위치 + 대상(업종/주제)).
 * 결제·승인 전에 미리 알려 주는 검사다. 마지막 판정(모든 경로·동시 승인)은 DB 트리거
 * `feed_ad_campaigns_pool_capacity_guard` 가 같은 풀을 잠그고 센다 — 막히면 `isFeedAdPoolCapacityDbError`.
 */
export async function assertFeedAdPoolCapacityAvailable(
  sb: SupabaseClient,
  placement: string,
  target: { targetCategoryId?: string | null; targetTopicSlug?: string | null; excludeCampaignId?: string | null } = {},
  nowMs: number = Date.now()
): Promise<{ ok: true } | { ok: false; error: "capacity_full" | "capacity_check_failed"; httpStatus: number; used?: number; capacity?: number }> {
  const capacity = feedAdPoolCapacity(placement);
  const key = feedAdPoolTargetKey(placement, target);
  const { data, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, status, end_at, target_category_id, target_topic_slug")
    .eq("placement", placement);
  if (error) return { ok: false, error: "capacity_check_failed", httpStatus: 500 };
  const used = (data ?? []).filter((r) => {
    const row = r as {
      id?: string;
      status?: unknown;
      end_at?: string | null;
      target_category_id?: string | null;
      target_topic_slug?: string | null;
    };
    if (target.excludeCampaignId && String(row.id ?? "") === target.excludeCampaignId) return false;
    if (
      feedAdPoolTargetKey(placement, {
        targetCategoryId: row.target_category_id,
        targetTopicSlug: row.target_topic_slug,
      }) !== key
    ) {
      return false;
    }
    return feedAdPoolOccupiesCampaign({ status: String(row.status ?? ""), endAt: row.end_at ?? null }, nowMs);
  }).length;
  if (used >= capacity) return { ok: false, error: "capacity_full", httpStatus: 409, used, capacity };
  return { ok: true };
}
