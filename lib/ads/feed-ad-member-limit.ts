/**
 * ONE MEMBER = ONE CURRENT FEED BANNER (Product B).
 *
 * "1" means one open lifecycle per member — NOT one ad in the whole system.
 * Many members may each hold one current banner in the same placement pool.
 *
 * Blocking display statuses: pending_review | scheduled | active
 * Allow new create: rejected | cancelled | ended
 */

import {
  projectFeedAdMemberPresentation,
  type FeedAdMemberDisplayStatus,
} from "@/lib/ads/feed-ad-member-presentation";

/** Request rows that may still represent an open lifecycle (window checked via presentation). */
export const FEED_AD_POTENTIALLY_OPEN_REQUEST_STATUSES = [
  "pending_review",
  "approved",
  "active",
] as const;

export type FeedAdPotentiallyOpenRequestStatus =
  (typeof FEED_AD_POTENTIALLY_OPEN_REQUEST_STATUSES)[number];

export const FEED_AD_CURRENT_BANNER_BLOCKING_DISPLAY: ReadonlySet<FeedAdMemberDisplayStatus> =
  new Set(["pending_review", "scheduled", "active"]);

export function isFeedAdDisplayStatusBlockingNewCreate(
  displayStatus: FeedAdMemberDisplayStatus | string
): boolean {
  return FEED_AD_CURRENT_BANNER_BLOCKING_DISPLAY.has(
    displayStatus as FeedAdMemberDisplayStatus
  );
}

export type FeedAdRequestLimitRow = {
  id: string;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  /** D-8 (2026-11-04): 캠페인 상태 — 관리자가 종료(`ended`)했으면 신청 행이 active 로 남아 있어도 진행 중이 아니다 */
  campaignStatus?: string | null;
};

function isTerminalCampaignStatus(st: string | null | undefined): st is string {
  const v = String(st ?? "").toLowerCase();
  return v === "ended" || v === "expired";
}

/**
 * Pick the member's current open banner, if any.
 * Prefer pending_review, then scheduled, then active (stable sort by created order of input).
 */
export function findCurrentFeedAdBanner(
  rows: FeedAdRequestLimitRow[],
  nowMs?: number
): { requestId: string; displayStatus: FeedAdMemberDisplayStatus } | null {
  const now = nowMs ?? Date.now();
  let found: { requestId: string; displayStatus: FeedAdMemberDisplayStatus; rank: number } | null =
    null;
  for (const row of rows) {
    const presentation = projectFeedAdMemberPresentation({
      requestStatus: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      // 종료만 반영한다 — 정지(paused)는 여전히 진행 중 1개로 센다(FB-M01 유지)
      campaignStatus: isTerminalCampaignStatus(row.campaignStatus) ? row.campaignStatus : null,
      nowMs: now,
    });
    if (!isFeedAdDisplayStatusBlockingNewCreate(presentation.displayStatus)) continue;
    const rank =
      presentation.displayStatus === "pending_review"
        ? 0
        : presentation.displayStatus === "scheduled"
          ? 1
          : 2;
    if (!found || rank < found.rank) {
      found = {
        requestId: row.id,
        displayStatus: presentation.displayStatus,
        rank,
      };
    }
  }
  return found
    ? { requestId: found.requestId, displayStatus: found.displayStatus }
    : null;
}
