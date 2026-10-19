import { NextRequest, NextResponse } from "next/server";
import { normalizeFeedAdDestination } from "@/lib/ads/feed-ad-destination";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listFeedAdCampaignsForAdmin } from "@/lib/ads/feed-ad-campaigns-db";
import type { FeedAdDomain, FeedAdPlacement, FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";
import {
  isFeedAdCommunityTopicTargetAllowed,
  normalizeFeedAdTopicSlug,
} from "@/lib/ads/feed-ad-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/feed-ads — Admin Feed Ad campaigns (no asset debit). */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: true, campaigns: [] });
  try {
    const campaigns = await listFeedAdCampaignsForAdmin(sb);
    return NextResponse.json({ ok: true, campaigns });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

/** POST — create draft campaign + up to 3 slides */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    domain?: FeedAdDomain;
    placement?: FeedAdPlacement;
    targetCategoryId?: string;
    targetTopicSlug?: string;
    status?: string;
    priority?: number;
    startAt?: string;
    endAt?: string;
    destinationType?: FeedAdDestinationType;
    destinationId?: string;
    destinationUrl?: string;
    slides?: Array<{
      sortOrder?: number;
      imageUrl?: string;
      altText?: string;
      headline?: string;
    }>;
  };

  const domain = body.domain === "community" ? "community" : "trade";
  const placement = (body.placement ??
    (domain === "trade" ? "TRADE_HOME" : "COMMUNITY_HOME")) as FeedAdPlacement;

  if (
    placement === "COMMUNITY_TOPIC" &&
    !isFeedAdCommunityTopicTargetAllowed(String(body.targetTopicSlug ?? ""))
  ) {
    return NextResponse.json({ ok: false, error: "topic_not_targetable" }, { status: 400 });
  }

  // EVT-05: destination validated by the shared DestinationRef contract (https only, event ok).
  // Empty internal_page keeps the existing NONE contract (stored as empty id/url).
  const destEmpty =
    !String(body.destinationId ?? "").trim() &&
    !String(body.destinationUrl ?? "").trim() &&
    (!body.destinationType || body.destinationType === "internal_page");
  const dest = normalizeFeedAdDestination({
    destinationType: destEmpty ? "none" : (body.destinationType ?? "internal_page"),
    destinationId: body.destinationId,
    destinationUrl: body.destinationUrl,
  });
  if (!dest.ok) {
    return NextResponse.json({ ok: false, error: dest.error }, { status: 400 });
  }

  const topicSlugNorm =
    placement === "COMMUNITY_TOPIC"
      ? normalizeFeedAdTopicSlug(String(body.targetTopicSlug ?? ""))
      : null;

  const { data: camp, error } = await sb
    .from("feed_ad_campaigns")
    .insert({
      name: (body.name ?? "").trim() || "Untitled",
      domain,
      placement,
      target_category_id: body.targetCategoryId?.trim() || null,
      target_topic_slug: topicSlugNorm,
      status: body.status === "active" ? "active" : "draft",
      priority: Number(body.priority ?? 100),
      start_at: body.startAt || null,
      end_at: body.endAt || null,
      destination_type: dest.value.destinationType,
      destination_id: dest.value.destinationId,
      destination_url: dest.value.destinationUrl,
      source: "ADMIN_DIRECT",
      created_by: admin.userId,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const campaignId = String((camp as { id?: string }).id ?? "");
  const slides = (body.slides ?? [])
    .map((s, i) => ({
      campaign_id: campaignId,
      sort_order: Math.min(3, Math.max(1, Number(s.sortOrder ?? i + 1))),
      image_url: (s.imageUrl ?? "").trim(),
      alt_text: (s.altText ?? "").trim(),
      headline: (s.headline ?? "").trim(),
      is_active: Boolean((s.imageUrl ?? "").trim()),
    }))
    .filter((s) => s.image_url)
    .slice(0, 3);

  if (slides.length > 0) {
    const { error: cErr } = await sb.from("feed_ad_creatives").insert(slides);
    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message, campaignId }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, campaignId });
}
