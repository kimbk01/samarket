import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { feedAdPoolRemaining, type FeedAdPoolOccupancyRow } from "@/lib/ads/feed-ad-pool-capacity";

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
): Promise<{ ok: true; used: number; capacity: number; remaining: number } | { ok: false; error: "capacity_full" | "capacity_check_failed"; httpStatus: number; used?: number; capacity?: number }> {
  const r = await loadFeedAdPoolRemaining(sb, placement, target, nowMs);
  if (!r.ok) return { ok: false, error: "capacity_check_failed", httpStatus: 500 };
  if (r.used >= r.capacity) return { ok: false, error: "capacity_full", httpStatus: 409, used: r.used, capacity: r.capacity };
  return { ok: true, used: r.used, capacity: r.capacity, remaining: r.remaining };
}

/** FB-A11 · D-7: 한 풀의 남은 자리 (회원 신청 화면 안내 · 신청 API 재검사 · 승인 검사 공용) — 세는 규칙은 `countFeedAdPoolOccupancy` */
export async function loadFeedAdPoolRemaining(
  sb: SupabaseClient,
  placement: string,
  target: { targetCategoryId?: string | null; targetTopicSlug?: string | null; excludeCampaignId?: string | null } = {},
  nowMs: number = Date.now()
): Promise<{ ok: true; used: number; capacity: number; remaining: number } | { ok: false }> {
  const { data, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, placement, status, end_at, target_category_id, target_topic_slug")
    .eq("placement", placement);
  if (error) return { ok: false };
  const rows: FeedAdPoolOccupancyRow[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id != null ? String(row.id) : null,
      placement: String(row.placement ?? placement),
      status: String(row.status ?? ""),
      endAt: (row.end_at as string | null | undefined) ?? null,
      targetCategoryId: (row.target_category_id as string | null | undefined) ?? null,
      targetTopicSlug: (row.target_topic_slug as string | null | undefined) ?? null,
    };
  });
  return { ok: true, ...feedAdPoolRemaining(rows, placement, target, nowMs, target.excludeCampaignId ?? null) };
}
