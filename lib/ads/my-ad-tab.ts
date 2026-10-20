/**
 * 내 광고(S46) 탭 분류 — `?tab=active|pending|ended` (진행중 · 대기 · 종료).
 *
 * 피드 배너(표시 상태 `FeedAdMemberDisplayStatus`, `feed-ad-member-presentation.ts`):
 *   진행중 = active·paused / 대기 = pending_review·scheduled / 종료 = rejected·cancelled·ended
 * 포인트 홍보(`AdApplyStatus`, `/api/me/post-ads`) — 같은 3분류로 매핑:
 *   진행중 = active / 대기 = draft·pending_payment·pending_review·approved(시작 전) / 종료 = rejected·expired·cancelled
 * 알 수 없는 값은 대기(운영 확인 대상)로 둔다 — 종료로 숨기지 않는다.
 */
import type { AdApplyStatus } from "@/lib/ads/types";
import type { FeedAdMemberDisplayStatus } from "@/lib/ads/feed-ad-member-presentation";

export type MyAdTab = "active" | "pending" | "ended";

export const MY_AD_TAB_VALUES: readonly MyAdTab[] = ["active", "pending", "ended"];

const FEED_TAB: Record<FeedAdMemberDisplayStatus, MyAdTab> = {
  active: "active",
  paused: "active",
  pending_review: "pending",
  scheduled: "pending",
  rejected: "ended",
  cancelled: "ended",
  ended: "ended",
};

const POST_AD_TAB: Record<AdApplyStatus, MyAdTab> = {
  active: "active",
  draft: "pending",
  pending_payment: "pending",
  pending_review: "pending",
  approved: "pending",
  rejected: "ended",
  expired: "ended",
  cancelled: "ended",
};

export function classifyMyAdTab(displayStatus: string | null | undefined): MyAdTab {
  const s = String(displayStatus ?? "").trim() as FeedAdMemberDisplayStatus;
  return FEED_TAB[s] ?? "pending";
}

export function classifyMyPostAdTab(applyStatus: string | null | undefined): MyAdTab {
  const s = String(applyStatus ?? "").trim() as AdApplyStatus;
  return POST_AD_TAB[s] ?? "pending";
}

/** 신청 화면 다녀오면 [대기] 탭 — 종류 시트에서 신청 화면으로 갈 때 표시, 내 광고 복귀 시 1회 소비 */
const RETURN_PENDING_KEY = "dibay:mypage-ads:return-to-pending";

export function markMyAdsReturnToPending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(RETURN_PENDING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeMyAdsReturnToPending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const hit = sessionStorage.getItem(RETURN_PENDING_KEY) === "1";
    if (hit) sessionStorage.removeItem(RETURN_PENDING_KEY);
    return hit;
  } catch {
    return false;
  }
}
