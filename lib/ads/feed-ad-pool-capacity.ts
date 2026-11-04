/**
 * Feed banner pool capacity / occupancy — Admin inventory + create form share this.
 * Pool N/3 semantics. Not Slide/Slot frames.
 */

import {
  BANNER_PLACEMENT_CAPACITY_SSOT,
  bannerPlacementDefaultCapacity,
} from "@/lib/ads/banner-placement-capacity-ssot";
import type { FeedAdPlacement } from "@/lib/ads/feed-ad-placement";

/** Canonical pool cap (3) for Community/Trade home + topic/category. */
export function feedAdPoolCapacity(placement: FeedAdPlacement | string): number {
  const p = String(placement ?? "").toUpperCase();
  if (p === "TRADE_HOME" || p === "COMMUNITY_HOME") {
    return bannerPlacementDefaultCapacity(p);
  }
  // Topic/category pool uses the same 3-cap semantics as home (Owner R2 / Admin create).
  if (p === "TRADE_CATEGORY" || p === "COMMUNITY_TOPIC") {
    return BANNER_PLACEMENT_CAPACITY_SSOT.COMMUNITY_HOME.defaultCapacity;
  }
  return bannerPlacementDefaultCapacity(p);
}

/** Counts toward pool occupancy (matches AdminFeedAdCreatePage authority). */
export function feedAdPoolOccupiesStatus(status: string | null | undefined): boolean {
  const st = String(status ?? "").toLowerCase();
  if (!st) return false;
  return st !== "ended" && st !== "rejected" && st !== "draft";
}

/**
 * N-01/E-11 — 표시 규칙만 (DB 는 고치지 않음): `active` 여도 종료 시각이 지났으면(종료 경계 exclusive — 고객 피드 로더와 같음)
 * 풀을 점유하지 않는다. 배너 현황(`banner-overview-model` mapFeedCampaign)·광고 운영 상태(`projectAdsOpsStatus`)와 같은 판정.
 */
export function feedAdCampaignEndedByWindow(endAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!endAt) return false;
  const end = Date.parse(endAt);
  return Number.isFinite(end) && end <= nowMs;
}

/** 상태 + 종료 시각 기준 점유 여부 (관리자 위치 관리·등록 화면 공용). */
export function feedAdPoolOccupiesCampaign(
  c: { status: string | null | undefined; endAt?: string | null },
  nowMs: number = Date.now()
): boolean {
  return feedAdPoolOccupiesStatus(c.status) && !feedAdCampaignEndedByWindow(c.endAt, nowMs);
}

/**
 * 광고 S-3 — 풀 = 위치 + 대상. 업종(TRADE_CATEGORY)·주제(COMMUNITY_TOPIC)는 대상별로 따로 센다
 * (피드 배너 잠금 계약 「TOPIC 후보 풀 = 같은 주제만」). 홈은 대상 없음. DB 트리거 `feed_ad_campaigns_pool_capacity_guard` 와 같은 키.
 */
export function feedAdPoolTargetKey(
  placement: string | null | undefined,
  target: { targetCategoryId?: string | null; targetTopicSlug?: string | null }
): string {
  const p = String(placement ?? "").toUpperCase();
  if (p === "TRADE_CATEGORY") return String(target.targetCategoryId ?? "");
  if (p === "COMMUNITY_TOPIC") return String(target.targetTopicSlug ?? "");
  return "";
}

/** DB 트리거가 수용량 초과로 막았을 때의 오류 (`feed_ad_pool_capacity_full`). */
export function isFeedAdPoolCapacityDbError(err: { message?: string | null } | null | undefined): boolean {
  return String(err?.message ?? "").includes("feed_ad_pool_capacity_full");
}

/** FB-A11 · D-7: 풀 키 1개 = 「위치 + 업종/주제」 (DB 트리거·등록 화면·위치 지도·회원 신청이 같은 키) */
export function feedAdPoolKey(
  placement: string | null | undefined,
  target: { targetCategoryId?: string | null; targetTopicSlug?: string | null }
): string {
  const p = String(placement ?? "").toUpperCase();
  return `${p}|${feedAdPoolTargetKey(p, target)}`;
}

export type FeedAdPoolOccupancyRow = {
  id?: string | null;
  placement: string | null | undefined;
  status: string | null | undefined;
  endAt?: string | null;
  targetCategoryId?: string | null;
  targetTopicSlug?: string | null;
};

/**
 * FB-A11 · D-7: 풀별 점유 수 — **세 곳(위치 지도 · 어드민 등록 화면 · 서버 신청/승인 검사)이 이 함수 하나로 센다.**
 * 점유 규칙 = `feedAdPoolOccupiesCampaign` (DB 트리거 `feed_ad_campaigns_pool_capacity_guard` 와 같음).
 */
export function countFeedAdPoolOccupancy(
  rows: readonly FeedAdPoolOccupancyRow[],
  nowMs: number = Date.now(),
  excludeCampaignId?: string | null
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (excludeCampaignId && String(r.id ?? "") === excludeCampaignId) continue;
    if (!feedAdPoolOccupiesCampaign({ status: r.status, endAt: r.endAt ?? null }, nowMs)) continue;
    const key = feedAdPoolKey(r.placement, r);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** 한 풀의 사용·수용·남은 자리 */
export function feedAdPoolRemaining(
  rows: readonly FeedAdPoolOccupancyRow[],
  placement: string,
  target: { targetCategoryId?: string | null; targetTopicSlug?: string | null },
  nowMs: number = Date.now(),
  excludeCampaignId?: string | null
): { used: number; capacity: number; remaining: number } {
  const capacity = feedAdPoolCapacity(placement);
  const used = countFeedAdPoolOccupancy(rows, nowMs, excludeCampaignId).get(feedAdPoolKey(placement, target)) ?? 0;
  return { used, capacity, remaining: Math.max(0, capacity - used) };
}
