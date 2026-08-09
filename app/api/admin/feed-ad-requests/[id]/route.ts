import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { approveFeedAdRequest } from "@/lib/ads/approve-feed-ad-request";
import {
  feedAdCreativeUrlRejectReason,
  isProductionReachableFeedAdCreativeUrl,
} from "@/lib/ads/feed-ad-creative-url";
import { listEligibleFeedAdCampaigns } from "@/lib/ads/feed-ad-campaigns-db";
import { normalizeFeedAdDestination } from "@/lib/ads/feed-ad-destination";
import { endFeedAdCampaign } from "@/lib/ads/end-feed-ad-campaign";
import { projectFeedAdOpsTimeline } from "@/lib/ads/feed-ad-ops-presentation";
import {
  isFeedAdCampaignEligibleNow,
  selectCampaignForPlacement,
  type FeedAdDomain,
  type FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";
import { releaseHeldPointsForFeedAdRequest } from "@/lib/ads/feed-ad-request-point-flow";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreativeOut = {
  id: string;
  sortOrder: number;
  imageUrl: string;
  altText: string;
  headline: string;
};

function mapCreative(row: Record<string, unknown>): CreativeOut {
  return {
    id: String(row.id ?? ""),
    sortOrder: Number(row.sort_order ?? 1),
    imageUrl: String(row.image_url ?? ""),
    altText: String(row.alt_text ?? ""),
    headline: String(row.headline ?? ""),
  };
}

/**
 * GET /api/admin/feed-ad-requests/[id]
 * Detail: request + request creatives (pending) or campaign creatives (active) — single authority.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const requestId = id.trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: reqRow, error } = await sb
    .from("feed_ad_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !reqRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = reqRow as Record<string, unknown>;
  const status = String(row.status ?? "");
  const campaignId = row.campaign_id != null ? String(row.campaign_id) : null;

  let creativeAuthority: "request" | "campaign" = "request";
  let creatives: CreativeOut[] = [];
  let campaign: Record<string, unknown> | null = null;

  if (
    campaignId &&
    (status === "active" || status === "approved" || status === "ended")
  ) {
    creativeAuthority = "campaign";
    const [{ data: camp }, { data: campCreatives }] = await Promise.all([
      sb.from("feed_ad_campaigns").select("*").eq("id", campaignId).maybeSingle(),
      sb
        .from("feed_ad_creatives")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("sort_order", { ascending: true }),
    ]);
    campaign = (camp as Record<string, unknown>) ?? null;
    creatives = (campCreatives ?? []).map((c) => mapCreative(c as Record<string, unknown>));
  } else {
    if (campaignId) {
      const { data: camp } = await sb
        .from("feed_ad_campaigns")
        .select("*")
        .eq("id", campaignId)
        .maybeSingle();
      campaign = (camp as Record<string, unknown>) ?? null;
    }
    const { data: reqCreatives } = await sb
      .from("feed_ad_request_creatives")
      .select("*")
      .eq("request_id", requestId)
      .order("sort_order", { ascending: true });
    creatives = (reqCreatives ?? []).map((c) => mapCreative(c as Record<string, unknown>));
  }

  const userId = String(row.user_id ?? "");
  const { data: profile } = userId
    ? await sb.from("profiles").select("nickname").eq("id", userId).maybeSingle()
    : { data: null };
  const memberLabel =
    String((profile as { nickname?: string | null } | null)?.nickname ?? "").trim() ||
    (userId ? `${userId.slice(0, 8)}…` : "—");

  const { data: holds } = await sb
    .from("feed_ad_point_holds")
    .select("id, amount, status, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });

  const domain = (String(row.domain ?? "") === "community" ? "community" : "trade") as FeedAdDomain;
  const placement = String(row.placement ?? "") as FeedAdPlacement;
  const primaryUrl = creatives[0]?.imageUrl ?? "";
  let placementWinnerId: string | null = null;
  try {
    const eligible = await listEligibleFeedAdCampaigns(sb, domain);
    const winner = selectCampaignForPlacement(eligible, {
      domain,
      placement,
      categoryId: row.target_category_id != null ? String(row.target_category_id) : null,
      topicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
    });
    placementWinnerId = winner?.id ?? null;
  } catch {
    placementWinnerId = null;
  }

  const campaignEligible = campaign
    ? isFeedAdCampaignEligibleNow({
        status: String(campaign.status ?? "") as "active",
        startAt: campaign.start_at != null ? String(campaign.start_at) : null,
        endAt: campaign.end_at != null ? String(campaign.end_at) : null,
      })
    : false;

  return NextResponse.json({
    ok: true,
    request: {
      id: String(row.id ?? ""),
      userId,
      memberLabel,
      status,
      domain: String(row.domain ?? ""),
      placement: String(row.placement ?? ""),
      productId: String(row.product_id ?? ""),
      pointCost: Number(row.point_cost ?? 0),
      durationDays: Number(row.duration_days ?? 0),
      targetCategoryId: row.target_category_id != null ? String(row.target_category_id) : null,
      targetTopicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
      destinationType: String(row.destination_type ?? ""),
      destinationId: String(row.destination_id ?? ""),
      destinationUrl: String(row.destination_url ?? ""),
      reviewReason: row.review_reason != null ? String(row.review_reason) : null,
      campaignId,
      reviewedBy: row.reviewed_by != null ? String(row.reviewed_by) : null,
      reviewedAt: row.reviewed_at != null ? String(row.reviewed_at) : null,
      createdAt: String(row.created_at ?? ""),
      source: "MEMBER_REQUEST",
    },
    creativeAuthority,
    creatives,
    campaign: campaign
      ? {
          id: String(campaign.id ?? ""),
          status: String(campaign.status ?? ""),
          startAt: campaign.start_at != null ? String(campaign.start_at) : null,
          endAt: campaign.end_at != null ? String(campaign.end_at) : null,
          source: String(campaign.source ?? ""),
        }
      : null,
    holds: (holds ?? []).map((h) => {
      const hr = h as Record<string, unknown>;
      return {
        id: String(hr.id ?? ""),
        amount: Number(hr.amount ?? 0),
        status: String(hr.status ?? ""),
        createdAt: String(hr.created_at ?? ""),
      };
    }),
    /** Delivery diagnose only — not AdminFormSheet redesign. */
    deliveryDiagnose: {
      campaignEligibleNow: campaignEligible,
      creativeUrlReachable: primaryUrl
        ? isProductionReachableFeedAdCreativeUrl(primaryUrl)
        : false,
      creativeUrlRejectReason: primaryUrl
        ? feedAdCreativeUrlRejectReason(primaryUrl)
        : "creative_url_empty",
      placementWinnerCampaignId: placementWinnerId,
      isCurrentPlacementWinner: Boolean(
        campaignId && placementWinnerId && campaignId === placementWinnerId
      ),
    },
    timeline: projectFeedAdOpsTimeline({
      request: {
        createdAt: String(row.created_at ?? ""),
        status,
        reviewReason: row.review_reason != null ? String(row.review_reason) : null,
        reviewedAt: row.reviewed_at != null ? String(row.reviewed_at) : null,
      },
      campaign: campaign
        ? {
            status: String(campaign.status ?? ""),
            startAt: campaign.start_at != null ? String(campaign.start_at) : null,
            endAt: campaign.end_at != null ? String(campaign.end_at) : null,
          }
        : null,
      holds: (holds ?? []).map((h) => {
        const hr = h as Record<string, unknown>;
        return {
          amount: Number(hr.amount ?? 0),
          status: String(hr.status ?? ""),
          createdAt: String(hr.created_at ?? ""),
        };
      }),
    }),
  });
}

/**
 * PATCH /api/admin/feed-ad-requests/[id]
 * actions:
 *   approve | reject | end — PHASE 1 / ops writers
 *   update — pending only: destination / durationDays (same request)
 *   replace_creative — same request creatives OR same campaign creatives
 *   end — no auto refund (ADMIN_END_REFUND_POLICY_REQUIRED)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const requestId = id.trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: {
    action?: string;
    reason?: string;
    campaignId?: string;
    destinationType?: string;
    destinationId?: string;
    destinationUrl?: string;
    durationDays?: number;
    sortOrder?: number;
    imageUrl?: string;
    altText?: string;
    headline?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  if (action === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    }

    const { data: reqRow, error: fetchErr } = await sb
      .from("feed_ad_requests")
      .select("id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (fetchErr || !reqRow) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (String((reqRow as { status?: string }).status) !== "pending_review") {
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
    }

    const released = await releaseHeldPointsForFeedAdRequest(sb, { requestId });
    if (!released.ok) {
      return NextResponse.json({ ok: false, error: released.error }, { status: 500 });
    }
    const now = new Date().toISOString();
    const { data: rejected, error: upd } = await sb
      .from("feed_ad_requests")
      .update({
        status: "rejected",
        review_reason: reason.slice(0, 500),
        reviewed_by: admin.userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();
    if (upd) {
      return NextResponse.json({ ok: false, error: upd.message }, { status: 500 });
    }
    if (!rejected?.id) {
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "approve") {
    const result = await approveFeedAdRequest(sb, {
      requestId,
      adminUserId: admin.userId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      campaignId: result.campaignId,
    });
  }

  if (action === "end") {
    // ADMIN_END_REFUND_POLICY_REQUIRED — no auto refund (CAPTURE already settled).
    const result = await endFeedAdCampaign(sb, {
      adminUserId: admin.userId,
      requestId,
      campaignId: body.campaignId != null ? String(body.campaignId) : null,
      reason: body.reason != null ? String(body.reason) : "admin_ended",
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus }
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      campaignId: result.campaignId,
      requestId: result.requestId,
      refund: false,
      refundPolicy: "ADMIN_END_REFUND_POLICY_REQUIRED",
    });
  }

  if (action === "update") {
    const { data: reqRow, error: fetchErr } = await sb
      .from("feed_ad_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (fetchErr || !reqRow) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (String((reqRow as { status?: string }).status) !== "pending_review") {
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const hasDest =
      body.destinationType != null || body.destinationId != null || body.destinationUrl != null;
    if (hasDest) {
      const dest = normalizeFeedAdDestination({
        destinationType: String(
          body.destinationType ?? (reqRow as { destination_type?: string }).destination_type ?? "none"
        ),
        destinationId:
          body.destinationId ?? String((reqRow as { destination_id?: string }).destination_id ?? ""),
        destinationUrl:
          body.destinationUrl ?? String((reqRow as { destination_url?: string }).destination_url ?? ""),
      });
      if (!dest.ok) {
        return NextResponse.json({ ok: false, error: dest.error }, { status: 400 });
      }
      patch.destination_type = dest.value.destinationType;
      patch.destination_id = dest.value.destinationId;
      patch.destination_url = dest.value.destinationUrl;
    }

    if (body.durationDays != null) {
      const days = Math.floor(Number(body.durationDays));
      if (!Number.isFinite(days) || days < 1 || days > 90) {
        return NextResponse.json({ ok: false, error: "invalid_duration" }, { status: 400 });
      }
      patch.duration_days = days;
    }

    const { error: upd } = await sb
      .from("feed_ad_requests")
      .update(patch)
      .eq("id", requestId)
      .eq("status", "pending_review");
    if (upd) {
      return NextResponse.json({ ok: false, error: upd.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "pending_review" });
  }

  if (action === "replace_creative") {
    const imageUrl = String(body.imageUrl ?? "").trim();
    if (!imageUrl || imageUrl.startsWith("blob:")) {
      return NextResponse.json({ ok: false, error: "persisted_url_required" }, { status: 400 });
    }
    if (!isProductionReachableFeedAdCreativeUrl(imageUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error: feedAdCreativeUrlRejectReason(imageUrl) ?? "creative_url_invalid",
        },
        { status: 400 }
      );
    }
    const sortOrder = Math.max(1, Math.floor(Number(body.sortOrder) || 1));

    const { data: reqRow, error: fetchErr } = await sb
      .from("feed_ad_requests")
      .select("id, status, campaign_id")
      .eq("id", requestId)
      .maybeSingle();
    if (fetchErr || !reqRow) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const status = String((reqRow as { status?: string }).status ?? "");
    const campaignId =
      (reqRow as { campaign_id?: string | null }).campaign_id != null
        ? String((reqRow as { campaign_id?: string }).campaign_id)
        : null;

    const creativePatchRequest = {
      image_url: imageUrl,
      alt_text: String(body.altText ?? "").trim(),
      headline: String(body.headline ?? "").trim(),
    };
    const creativePatchCampaign = {
      ...creativePatchRequest,
      updated_at: new Date().toISOString(),
    };

    if (status === "pending_review" || !campaignId) {
      const { data: existing } = await sb
        .from("feed_ad_request_creatives")
        .select("id")
        .eq("request_id", requestId)
        .eq("sort_order", sortOrder)
        .maybeSingle();
      if (existing?.id) {
        const { error: upd } = await sb
          .from("feed_ad_request_creatives")
          .update(creativePatchRequest)
          .eq("id", String(existing.id));
        if (upd) {
          return NextResponse.json({ ok: false, error: upd.message }, { status: 500 });
        }
      } else {
        const { error: ins } = await sb.from("feed_ad_request_creatives").insert({
          request_id: requestId,
          sort_order: sortOrder,
          ...creativePatchRequest,
        });
        if (ins) {
          return NextResponse.json({ ok: false, error: ins.message }, { status: 500 });
        }
      }
      return NextResponse.json({
        ok: true,
        creativeAuthority: "request",
        imageUrl,
        sortOrder,
      });
    }

    // Same campaign — never ADMIN_DIRECT bypass
    const { data: existing } = await sb
      .from("feed_ad_creatives")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("sort_order", sortOrder)
      .maybeSingle();
    if (existing?.id) {
      const { error: upd } = await sb
        .from("feed_ad_creatives")
        .update(creativePatchCampaign)
        .eq("id", String(existing.id));
      if (upd) {
        return NextResponse.json({ ok: false, error: upd.message }, { status: 500 });
      }
    } else {
      const { error: ins } = await sb.from("feed_ad_creatives").insert({
        campaign_id: campaignId,
        sort_order: sortOrder,
        image_url: imageUrl,
        alt_text: creativePatchRequest.alt_text,
        headline: creativePatchRequest.headline,
      });
      if (ins) {
        return NextResponse.json({ ok: false, error: ins.message }, { status: 500 });
      }
    }
    return NextResponse.json({
      ok: true,
      creativeAuthority: "campaign",
      campaignId,
      imageUrl,
      sortOrder,
    });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
