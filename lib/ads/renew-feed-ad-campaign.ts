/**
 * Feed Banner renewal — Point spend ↔ period extension (PHASE 3).
 *
 * Financial invariant (same class as PHASE 1):
 *   SPENT Point + period NOT extended = forbidden (refund on failure)
 *   Period extended + Point NOT spent = forbidden
 *
 * Reuses point_ledger (relatedType feed_ad_request) + existing campaign/request rows.
 * NO new renewals table.
 *
 * Unchanged creative/destination → auto extend (no re-review).
 * Changed creative/destination → reject here; member must new PHASE 2 request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeedAdProduct } from "@/lib/ads/feed-ad-products";
import { computeFeedAdRenewalEndAt, feedAdRenewalBlockedByAdmin } from "@/lib/ads/feed-ad-member-presentation";
import { spendUserPoints } from "@/lib/points/user-point-ledger";
import { refundPointsAfterFailedPurchase } from "@/lib/points/refund-points-after-failed-purchase";
import { assertFeedAdPoolCapacityAvailable } from "@/lib/ads/feed-ad-pool-capacity-server";
import { feedAdPoolOccupiesCampaign, isFeedAdPoolCapacityDbError } from "@/lib/ads/feed-ad-pool-capacity";

export type RenewFeedAdCampaignResult =
  | {
      ok: true;
      campaignId: string;
      endAt: string;
      pointCost: number;
      idempotentReplay?: boolean;
    }
  | { ok: false; error: string; httpStatus: number };

function renewLedgerId(campaignId: string, idempotencyKey: string): string {
  return `renew:${campaignId}:${idempotencyKey}`.slice(0, 200);
}

function renewRefundLedgerId(campaignId: string, idempotencyKey: string): string {
  return `renew-refund:${campaignId}:${idempotencyKey}`.slice(0, 200);
}

async function hasLedgerEntry(
  sb: SupabaseClient,
  userId: string,
  relatedId: string
): Promise<boolean> {
  const { data } = await sb
    .from("point_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("related_type", "feed_ad_request")
    .eq("related_id", relatedId)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function renewFeedAdCampaign(
  sb: SupabaseClient,
  params: {
    userId: string;
    campaignId: string;
    productId: string;
    idempotencyKey: string;
    /** If true, reject — caller must open new review request instead. */
    creativeOrDestinationChanged?: boolean;
    nowMs?: number;
  }
): Promise<RenewFeedAdCampaignResult> {
  const campaignId = params.campaignId.trim();
  const idem = params.idempotencyKey.trim().slice(0, 128);
  const nowMs = params.nowMs ?? Date.now();

  if (!campaignId || !idem) {
    return { ok: false, error: "missing_id", httpStatus: 400 };
  }
  if (params.creativeOrDestinationChanged) {
    return { ok: false, error: "re_review_required", httpStatus: 409 };
  }

  const product = await getFeedAdProduct(sb, params.productId);
  if (!product) {
    return { ok: false, error: "product_not_found", httpStatus: 400 };
  }

  const { data: camp, error: campErr } = await sb
    .from("feed_ad_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr || !camp) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }

  const row = camp as Record<string, unknown>;
  const source = String(row.source ?? "");
  if (source !== "MEMBER_REQUESTED") {
    return { ok: false, error: "not_member_campaign", httpStatus: 403 };
  }

  const requestId = row.request_id != null ? String(row.request_id) : "";
  if (!requestId) {
    return { ok: false, error: "request_missing", httpStatus: 409 };
  }

  const { data: reqRow, error: reqErr } = await sb
    .from("feed_ad_requests")
    .select("id, user_id, status, domain")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !reqRow) {
    return { ok: false, error: "request_missing", httpStatus: 404 };
  }
  if (String((reqRow as { user_id?: string }).user_id) !== params.userId) {
    return { ok: false, error: "forbidden", httpStatus: 403 };
  }

  const reqStatus = String((reqRow as { status?: string }).status ?? "");
  if (reqStatus === "pending_review" || reqStatus === "rejected" || reqStatus === "cancelled") {
    return { ok: false, error: "not_renewable", httpStatus: 409 };
  }

  const campDomain = String(row.domain ?? "");
  if (product.domain !== campDomain) {
    return { ok: false, error: "domain_mismatch", httpStatus: 400 };
  }

  const campStatus = String(row.status ?? "");
  // Owner 결정 1: 관리자 정지·종료는 회원 연장으로 우회할 수 없다 (기간이 끝난 active 만 연장)
  const adminBlock = feedAdRenewalBlockedByAdmin(campStatus);
  if (adminBlock) {
    return { ok: false, error: adminBlock, httpStatus: 409 };
  }
  if (campStatus !== "active") {
    return { ok: false, error: "not_renewable", httpStatus: 409 };
  }

  const currentEndAt = row.end_at != null ? String(row.end_at) : null;
  const newEndAt = computeFeedAdRenewalEndAt({
    currentEndAt,
    durationDays: product.durationDays,
    nowMs,
  });

  const relatedId = renewLedgerId(campaignId, idem);
  const refundId = renewRefundLedgerId(campaignId, idem);

  const alreadySpent = await hasLedgerEntry(sb, params.userId, relatedId);
  const alreadyRefunded = await hasLedgerEntry(sb, params.userId, refundId);

  if (alreadySpent && alreadyRefunded) {
    return { ok: false, error: "idempotency_consumed", httpStatus: 409 };
  }

  async function applyExtension(): Promise<RenewFeedAdCampaignResult> {
    const nowIso = new Date(nowMs).toISOString();
    const { data: updated, error: updErr } = await sb
      .from("feed_ad_campaigns")
      .update({
        end_at: newEndAt,
        status: "active",
        updated_at: nowIso,
      })
      .eq("id", campaignId)
      .select("id, end_at")
      .maybeSingle();
    if (isFeedAdPoolCapacityDbError(updErr)) {
      return { ok: false, error: "capacity_full", httpStatus: 409 };
    }
    if (updErr || !updated?.id) {
      return { ok: false, error: updErr?.message ?? "extension_failed", httpStatus: 500 };
    }
    await sb
      .from("feed_ad_requests")
      .update({
        status: "active",
        end_at: newEndAt,
        duration_days: product!.durationDays,
        point_cost: product!.pointCost,
        product_id: product!.id,
        updated_at: nowIso,
      })
      .eq("id", requestId)
      .eq("user_id", params.userId);
    return {
      ok: true,
      campaignId,
      endAt: String((updated as { end_at?: string }).end_at ?? newEndAt),
      pointCost: product!.pointCost,
    };
  }

  if (alreadySpent && !alreadyRefunded) {
    if (currentEndAt) {
      const t = Date.parse(currentEndAt);
      const target = Date.parse(newEndAt);
      if (Number.isFinite(t) && Number.isFinite(target) && t >= target - 1000) {
        return {
          ok: true,
          campaignId,
          endAt: currentEndAt,
          pointCost: product.pointCost,
          idempotentReplay: true,
        };
      }
    }
    const recovered = await applyExtension();
    if (recovered.ok) return { ...recovered, idempotentReplay: true };
    // 재감사 F-04 (2026-11-04 · 금전 재판정 P1): 차감은 됐는데 연장이 「자리 없음」으로 확정 실패하면
    // 여기서 환급한다 (예전에는 그대로 돌려줘 포인트가 빠진 채 광고가 없었다). 같은 refundId 라 1회만 환급된다.
    if (recovered.error === "capacity_full") {
      // 환급 금액 = 실제로 빠진 금액 (원장 행 · 상품 가격이 그사이 바뀌었어도 같은 금액)
      const { data: spentRow } = await sb
        .from("point_ledger")
        .select("amount")
        .eq("user_id", params.userId)
        .eq("related_type", "feed_ad_request")
        .eq("related_id", relatedId)
        .limit(1)
        .maybeSingle();
      const spentAmount = Math.abs(Number((spentRow as { amount?: unknown } | null)?.amount ?? 0));
      if (!(spentAmount > 0)) return { ok: false, error: "refund_pending", httpStatus: 502 };
      const refund = await refundPointsAfterFailedPurchase(sb, {
        userId: params.userId,
        amount: spentAmount,
        relatedType: "feed_ad_request",
        refundRelatedId: refundId,
        description: "피드 배너 연장 실패 — 포인트 환급",
      });
      if (!refund.ok) return { ok: false, error: "refund_pending", httpStatus: 502 };
    }
    return recovered;
  }

  // 광고 S-3: 끝난 광고를 다시 켜면 풀 자리를 새로 차지한다 → 결제 전에 자리부터 확인 (가득 차면 차감하지 않음).
  // 같은 순간 다른 경로가 자리를 가져가면 DB 트리거가 연장을 막고, 아래 환급 흐름이 포인트를 돌려준다.
  if (!feedAdPoolOccupiesCampaign({ status: campStatus, endAt: currentEndAt }, nowMs)) {
    const cap = await assertFeedAdPoolCapacityAvailable(
      sb,
      String(row.placement ?? ""),
      {
        targetCategoryId: row.target_category_id != null ? String(row.target_category_id) : null,
        targetTopicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
        excludeCampaignId: campaignId,
      },
      nowMs
    );
    if (!cap.ok) return { ok: false, error: cap.error, httpStatus: cap.httpStatus };
  }

  const spent = await spendUserPoints(sb, {
    userId: params.userId,
    amount: product.pointCost,
    entryType: "ad_purchase",
    relatedType: "feed_ad_request",
    relatedId,
    description: `피드 배너 연장 — ${product.durationDays}일 (${product.pointCost}P)`,
    actorType: "user",
  });
  if (!spent.ok) {
    return {
      ok: false,
      error: spent.code === "insufficient_balance" ? "insufficient_balance" : spent.error,
      httpStatus: spent.code === "insufficient_balance" ? 402 : 500,
    };
  }

  const extended = await applyExtension();
  if (!extended.ok) {
    // P0-3 — 환급 결과 확인. 실패하면 refund_pending (차감만 있고 환급 없는 상태 → 같은 연장 재시도 시
    // 위 alreadySpent 분기가 연장을 다시 적용하거나, 같은 refundId 로 1회만 환급된다).
    const refund = await refundPointsAfterFailedPurchase(sb, {
      userId: params.userId,
      amount: product.pointCost,
      relatedType: "feed_ad_request",
      refundRelatedId: refundId,
      description: "피드 배너 연장 실패 — 포인트 환급",
    });
    if (!refund.ok) {
      return { ok: false, error: "refund_pending", httpStatus: 502 };
    }
    return extended;
  }
  return extended;
}
