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
  captureHeldPointsForFeedAdRequest,
  compensateFeedAdPointHold,
  releaseHeldPointsForFeedAdRequest,
} from "@/lib/ads/feed-ad-request-point-flow";

export type ApproveFeedAdRequestResult =
  | { ok: true; status: "active"; campaignId: string }
  | { ok: false; error: string; httpStatus?: number };

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

  const now = new Date();
  const durationDays = Math.max(1, Number(row.duration_days ?? 7));
  const end = new Date(now.getTime() + durationDays * 86_400_000);
  const userId = String(row.user_id ?? "");
  const pointCost = Number(row.point_cost ?? 0);

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

  try {
    // F1: prepare campaign in non-eligible draft (not ACTIVE).
    const { data: campaign, error: campErr } = await sb
      .from("feed_ad_campaigns")
      .insert({
        name: `Member · ${String(row.product_id ?? "")}`,
        domain: String(row.domain),
        placement: String(row.placement),
        target_category_id: row.target_category_id,
        target_topic_slug: row.target_topic_slug,
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
