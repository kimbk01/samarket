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
import { tradeBoostOrderPhase } from "@/lib/promotion/trade-boost-order-state";
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

/** 상위노출 주문 — 진행 중(기간 안 active) · 대기(심사) · 종료(그 외) */
export function classifyMyBoostOrderTab(
  orderStatus: string | null | undefined,
  endAt: string | null | undefined,
  nowMs: number = Date.now()
): MyAdTab {
  /** 판정 1곳 `tradeBoostOrderPhase` (재감사 B-1) — 일시정지는 종료일과 관계없이 진행 중 */
  const phase = tradeBoostOrderPhase({ orderStatus, endAt }, nowMs);
  if (phase === "pending") return "pending";
  return phase === "ended" ? "ended" : "active";
}

/** 내 광고 상위노출 줄 상태 문구 — 일시정지·종료 이유는 DB `paused_by`·`end_reason_code` (트리거 `trade_promotion_sync_listing`) */
export function myBoostOrderStatusKey(
  order: { orderStatus?: string | null; endAt?: string | null; pausedBy?: string | null; endReasonCode?: string | null },
  nowMs: number = Date.now()
):
  | "mypage_oa_ads_boost_status_active"
  | "mypage_oa_ads_boost_status_pending"
  | "mypage_oa_ads_boost_status_ended"
  | "mypage_oa_ads_boost_status_paused"
  | "mypage_oa_ads_boost_status_paused_hidden"
  | "mypage_oa_ads_boost_status_paused_review"
  | "mypage_oa_ads_boost_status_ended_sold"
  | "mypage_oa_ads_boost_status_ended_deleted"
  | "mypage_oa_ads_boost_status_ended_policy" {
  const s = String(order.orderStatus ?? "").trim().toLowerCase();
  if (s === "paused") {
    if (order.pausedBy === "listing_owner_hidden") return "mypage_oa_ads_boost_status_paused_hidden";
    if (order.pausedBy === "listing_admin_hidden") return "mypage_oa_ads_boost_status_paused_review";
    return "mypage_oa_ads_boost_status_paused";
  }
  const tab = classifyMyBoostOrderTab(order.orderStatus, order.endAt, nowMs);
  if (tab === "active") return "mypage_oa_ads_boost_status_active";
  if (tab === "pending") return "mypage_oa_ads_boost_status_pending";
  if (order.endReasonCode === "listing_sold") return "mypage_oa_ads_boost_status_ended_sold";
  if (order.endReasonCode === "listing_owner_deleted") return "mypage_oa_ads_boost_status_ended_deleted";
  if (order.endReasonCode === "listing_admin_deleted") return "mypage_oa_ads_boost_status_ended_policy";
  return "mypage_oa_ads_boost_status_ended";
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
