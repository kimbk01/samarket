/**
 * Member Feed Ad Request — Admin approve financial + campaign activation.
 * CONTRACT (PHASE 1):
 *   1. CAPTURED POINT + NO VALID AD = IMPOSSIBLE
 *   2. ACTIVE AD + UNPAID/UNRESOLVED BILLING = IMPOSSIBLE
 *
 * Authority: prepare draft (non-eligible) → CAPTURE → activate.
 * Not: CAPTURE-first (leak) · Not: active-first then CAPTURE (unpaid active).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  feedAdCreativeUrlRejectReason,
  isProductionReachableFeedAdCreativeUrl,
} from "@/lib/ads/feed-ad-creative-url";
import {
  captureHeldPointsForFeedAdRequest,
  compensateFeedAdPointHold,
  releaseHeldPointsForFeedAdRequest,
  uncaptureFeedAdPointHold,
} from "@/lib/ads/feed-ad-request-point-flow";
import { feedAdDestinationRef } from "@/lib/ads/feed-ad-destination";
import { FEED_AD_APPROVE_LOST_CAPACITY_MESSAGE_KO } from "@/lib/ads/feed-ad-error-copy";
import { normalizeFeedAdTopicSlug } from "@/lib/ads/feed-ad-placement";
import { memberFeedAdCampaignName } from "@/lib/ads/feed-ad-advertiser-name";
import { assertFeedAdPoolCapacityAvailable } from "@/lib/ads/feed-ad-pool-capacity-server";
import { isFeedAdPoolCapacityDbError } from "@/lib/ads/feed-ad-pool-capacity";

export type ApproveFeedAdRequestResult =
  | { ok: true; status: "active"; campaignId: string }
  | {
      ok: false;
      error: string;
      httpStatus?: number;
      /** FB-P09: 화면 안내(한국어) — 동시 승인에서 자리가 차서 진 경우 */
      message?: string;
      /** FB-P09: 보류 포인트가 그대로 남았는지 (진 쪽 = true) */
      holdKept?: boolean;
    };

type RequestRow = {
  id: string;
  user_id: string;
  product_id: string;
  domain: string;
  placement: string;
  target_category_id: string | null;
  target_topic_slug: string | null;
  destination_type: string | null;
  destination_id: string | null;
  destination_url: string | null;
  duration_days: number;
  point_cost: number;
  status: string;
  reviewed_by: string | null;
};

async function deleteCampaignCascade(
  sb: SupabaseClient,
  campaignId: string
): Promise<void> {
  await sb.from("feed_ad_creatives").delete().eq("campaign_id", campaignId);
  await sb.from("feed_ad_campaigns").delete().eq("id", campaignId);
}

async function unclaimReview(
  sb: SupabaseClient,
  requestId: string,
  adminUserId: string
): Promise<void> {
  await sb
    .from("feed_ad_requests")
    .update({
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending_review")
    .eq("reviewed_by", adminUserId);
}

/**
 * Approve pending member feed-ad request.
 * Double-click: claim via reviewed_by CAS while status stays pending_review until activation.
 */
export async function approveFeedAdRequest(
  sb: SupabaseClient,
  input: { requestId: string; adminUserId: string }
): Promise<ApproveFeedAdRequestResult> {
  const requestId = input.requestId.trim();
  if (!requestId) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data: reqRow, error: fetchErr } = await sb
    .from("feed_ad_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchErr || !reqRow) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }

  const row = reqRow as RequestRow;
  if (String(row.status) !== "pending_review") {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }

  const { data: creatives, error: crErr } = await sb
    .from("feed_ad_request_creatives")
    .select("*")
    .eq("request_id", requestId)
    .order("sort_order", { ascending: true });
  if (crErr) {
    return { ok: false, error: crErr.message, httpStatus: 500 };
  }
  const slides = (creatives ?? []).filter(
    (c) => String((c as { image_url?: string }).image_url ?? "").trim().length > 0
  );
  if (slides.length < 1) {
    return { ok: false, error: "creatives_missing", httpStatus: 400 };
  }

  // Delivery authority: reject before claim/CAPTURE — no false success, no unpaid active.
  for (const c of slides) {
    const imageUrl = String((c as { image_url?: string }).image_url ?? "");
    if (!isProductionReachableFeedAdCreativeUrl(imageUrl)) {
      return {
        ok: false,
        error: feedAdCreativeUrlRejectReason(imageUrl) ?? "creative_url_invalid",
        httpStatus: 400,
      };
    }
  }

  // DS-3 · C-1: 목적지 없음(또는 깨진 목적지) 신청은 승인하지 않는다 — 누르면 반응 없는 배너 금지
  if (
    !feedAdDestinationRef({
      destinationType: row.destination_type,
      destinationId: row.destination_id,
      destinationUrl: row.destination_url,
    })
  ) {
    return { ok: false, error: "destination_required", httpStatus: 400 };
  }

  const now = new Date();
  const durationDays = Math.max(1, Number(row.duration_days ?? 7));
  const end = new Date(now.getTime() + durationDays * 86_400_000);
  const userId = String(row.user_id ?? "");
  const pointCost = Number(row.point_cost ?? 0);

  // 재감사 S-1 (F-3): 승인하면 풀을 점유하므로 수용량(위치별 3)을 먼저 검사한다 — 가득 차면 승인하지 않음(보류 포인트 그대로)
  const capacity = await assertFeedAdPoolCapacityAvailable(sb, String(row.placement ?? ""), {
    targetCategoryId: row.target_category_id,
    targetTopicSlug: row.target_topic_slug ? normalizeFeedAdTopicSlug(String(row.target_topic_slug)) : null,
  });
  if (!capacity.ok) {
    return {
      ok: false,
      error: capacity.error,
      httpStatus: capacity.httpStatus,
      ...(capacity.error === "capacity_full"
        ? { message: FEED_AD_APPROVE_LOST_CAPACITY_MESSAGE_KO, holdKept: true }
        : {}),
    };
  }

  // Claim (F6): only one admin may proceed; status remains pending until activation.
  const { data: claimed, error: claimErr } = await sb
    .from("feed_ad_requests")
    .update({
      reviewed_by: input.adminUserId,
      reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending_review")
    .is("reviewed_by", null)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    return { ok: false, error: claimErr.message, httpStatus: 500 };
  }
  if (!claimed?.id) {
    return { ok: false, error: "not_pending", httpStatus: 409 };
  }

  let campaignId: string | null = null;
  // 재감사 S-1 (F-1): 캠페인 이름 = 고객 화면 광고주 이름 → 신청 회원 닉네임 (내부 상품 코드 금지)
  const { data: requester } = await sb.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  const campaignName = memberFeedAdCampaignName((requester as { nickname?: string | null } | null)?.nickname);

  try {
    // F1: prepare campaign in non-eligible draft (not ACTIVE).
    const { data: campaign, error: campErr } = await sb
      .from("feed_ad_campaigns")
      .insert({
        name: campaignName,
        domain: String(row.domain),
        placement: String(row.placement),
        target_category_id: row.target_category_id,
        target_topic_slug: row.target_topic_slug
          ? normalizeFeedAdTopicSlug(String(row.target_topic_slug))
          : null,
        status: "draft",
        priority: 50,
        start_at: now.toISOString(),
        end_at: end.toISOString(),
        destination_type: String(row.destination_type ?? "internal_page"),
        destination_id: String(row.destination_id ?? ""),
        destination_url: String(row.destination_url ?? ""),
        source: "MEMBER_REQUESTED",
        request_id: requestId,
        created_by: input.adminUserId,
      })
      .select("id")
      .maybeSingle();

    if (campErr || !campaign?.id) {
      await unclaimReview(sb, requestId, input.adminUserId);
      return {
        ok: false,
        error: campErr?.message ?? "campaign_create_failed",
        httpStatus: 500,
      };
    }
    campaignId = String(campaign.id);

    // F2: creatives must persist before CAPTURE.
    const { error: slideErr } = await sb.from("feed_ad_creatives").insert(
      slides.map((c, i) => {
        const cr = c as Record<string, unknown>;
        return {
          campaign_id: campaignId,
          sort_order: i + 1,
          image_url: String(cr.image_url ?? ""),
          alt_text: String(cr.alt_text ?? ""),
          headline: String(cr.headline ?? ""),
          is_active: true,
        };
      })
    );

    if (slideErr) {
      await deleteCampaignCascade(sb, campaignId);
      await unclaimReview(sb, requestId, input.adminUserId);
      return { ok: false, error: slideErr.message, httpStatus: 500 };
    }

    // F3: CAPTURE only after draft campaign+creatives exist (still not eligible).
    const captured = await captureHeldPointsForFeedAdRequest(sb, {
      requestId,
      userId,
      pointCost,
    });
    if (!captured.ok) {
      await deleteCampaignCascade(sb, campaignId);
      await unclaimReview(sb, requestId, input.adminUserId);
      return { ok: false, error: captured.error, httpStatus: 500 };
    }

    // F5 activation: only now may ad become eligible + request active.
    const { data: activated, error: actErr } = await sb
      .from("feed_ad_campaigns")
      .update({
        status: "active",
        updated_at: now.toISOString(),
      })
      .eq("id", campaignId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();

    if (isFeedAdPoolCapacityDbError(actErr)) {
      // FB-P09: 같은 순간 다른 승인이 마지막 자리를 가져가 DB 트리거가 막았다 → 진 쪽은 포인트를 돌려주지 않고
      // 보류로 되돌린 뒤 「검토 중」으로 남긴다(다시 승인 가능 · 반려하면 그때 환급). 원장 이동 0.
      const uncaptured = await uncaptureFeedAdPointHold(sb, { requestId });
      await deleteCampaignCascade(sb, campaignId);
      if (!uncaptured.ok) {
        // 보류로 되돌리지 못하면 「확정 + 광고 없음」이 남지 않게 기존 보상(환급)으로 닫는다
        await compensateFeedAdPointHold(sb, { requestId });
        await unclaimReview(sb, requestId, input.adminUserId);
        return { ok: false, error: "capacity_full", httpStatus: 409, holdKept: false };
      }
      await unclaimReview(sb, requestId, input.adminUserId);
      return {
        ok: false,
        error: "capacity_full",
        httpStatus: 409,
        message: FEED_AD_APPROVE_LOST_CAPACITY_MESSAGE_KO,
        holdKept: true,
      };
    }
    if (actErr || !activated?.id) {
      // F4: CAPTURED but not ACTIVE — compensate credit + remove draft ad.
      await compensateFeedAdPointHold(sb, { requestId });
      await deleteCampaignCascade(sb, campaignId);
      await unclaimReview(sb, requestId, input.adminUserId);
      return {
        ok: false,
        error: actErr?.message ?? "campaign_activate_failed",
        httpStatus: 500,
      };
    }

    const { data: reqActive, error: updReq } = await sb
      .from("feed_ad_requests")
      .update({
        status: "active",
        campaign_id: campaignId,
        start_at: now.toISOString(),
        end_at: end.toISOString(),
        reviewed_by: input.adminUserId,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();

    if (updReq || !reqActive?.id) {
      // F4: campaign already active — must not leave ACTIVE + unresolved billing.
      // Pause eligibility: set campaign ended, compensate points, unclaim impossible (status may stick).
      await sb
        .from("feed_ad_campaigns")
        .update({ status: "ended", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
      await compensateFeedAdPointHold(sb, { requestId });
      // Leave request pending_review with reviewed_by cleared so admin can retry or reject.
      await sb
        .from("feed_ad_requests")
        .update({
          status: "pending_review",
          campaign_id: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      return {
        ok: false,
        error: updReq?.message ?? "request_activate_failed",
        httpStatus: 500,
      };
    }

    return { ok: true, status: "active", campaignId };
  } catch (e) {
    if (campaignId) {
      await deleteCampaignCascade(sb, campaignId).catch(() => undefined);
    }
    await compensateFeedAdPointHold(sb, { requestId }).catch(() => undefined);
    await releaseHeldPointsForFeedAdRequest(sb, { requestId }).catch(() => undefined);
    await unclaimReview(sb, requestId, input.adminUserId).catch(() => undefined);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "approve_failed",
      httpStatus: 500,
    };
  }
}
