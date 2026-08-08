import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import type { FeedAdDomain, FeedAdPlacement, FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";
import { getFeedAdProduct, listActiveFeedAdProducts } from "@/lib/ads/feed-ad-products";
import { holdPointsForFeedAdRequest } from "@/lib/ads/feed-ad-request-point-flow";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreativeIn = { imageUrl: string; altText?: string; headline?: string };

function mapRequestRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? ""),
    domain: String(row.domain ?? ""),
    placement: String(row.placement ?? ""),
    productId: String(row.product_id ?? ""),
    pointCost: Number(row.point_cost ?? 0),
    durationDays: Number(row.duration_days ?? 0),
    targetCategoryId: row.target_category_id != null ? String(row.target_category_id) : null,
    targetTopicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
    reviewReason: row.review_reason != null ? String(row.review_reason) : null,
    campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

/** GET — member feed ad request list + product catalog */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const domain = (req.nextUrl.searchParams.get("domain") || "").trim() as FeedAdDomain | "";
  const catalog = listActiveFeedAdProducts(domain || undefined);

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, requests: [], catalog });
  }

  const { data, error } = await sb
    .from("feed_ad_requests")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.includes("feed_ad_requests")) {
      return NextResponse.json({ ok: true, requests: [], catalog, tableMissing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    requests: (data ?? []).map((r) => mapRequestRow(r as Record<string, unknown>)),
    catalog,
  });
}

/** POST — create request + HOLD */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: {
    productId?: string;
    placement?: string;
    targetCategoryId?: string;
    targetTopicSlug?: string;
    destinationType?: string;
    destinationId?: string;
    destinationUrl?: string;
    creatives?: CreativeIn[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const product = getFeedAdProduct(String(body.productId ?? ""));
  if (!product) {
    return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 400 });
  }

  const placement = String(body.placement ?? "").trim() as FeedAdPlacement;
  const validPlacement: FeedAdPlacement[] = [
    "TRADE_HOME",
    "TRADE_CATEGORY",
    "COMMUNITY_HOME",
    "COMMUNITY_TOPIC",
  ];
  if (!validPlacement.includes(placement)) {
    return NextResponse.json({ ok: false, error: "invalid_placement" }, { status: 400 });
  }
  if (product.domain === "trade" && !placement.startsWith("TRADE_")) {
    return NextResponse.json({ ok: false, error: "placement_domain_mismatch" }, { status: 400 });
  }
  if (product.domain === "community" && !placement.startsWith("COMMUNITY_")) {
    return NextResponse.json({ ok: false, error: "placement_domain_mismatch" }, { status: 400 });
  }
  if (placement === "TRADE_CATEGORY" && !String(body.targetCategoryId ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }
  if (placement === "COMMUNITY_TOPIC" && !String(body.targetTopicSlug ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "topic_required" }, { status: 400 });
  }

  const creatives = (Array.isArray(body.creatives) ? body.creatives : [])
    .map((c) => ({
      imageUrl: String(c.imageUrl ?? "").trim(),
      altText: String(c.altText ?? "").trim(),
      headline: String(c.headline ?? "").trim(),
    }))
    .filter((c) => c.imageUrl.length > 0)
    .slice(0, 3);
  if (creatives.length < 1) {
    return NextResponse.json({ ok: false, error: "creatives_required" }, { status: 400 });
  }

  const destinationType = (String(body.destinationType ?? "internal_page").trim() ||
    "internal_page") as FeedAdDestinationType;
  const requestId = randomUUID();

  const { error: insErr } = await sb.from("feed_ad_requests").insert({
    id: requestId,
    user_id: auth.userId,
    product_id: product.id,
    domain: product.domain,
    placement,
    target_category_id:
      placement === "TRADE_CATEGORY" ? String(body.targetCategoryId ?? "").trim() : null,
    target_topic_slug:
      placement === "COMMUNITY_TOPIC" ? String(body.targetTopicSlug ?? "").trim() : null,
    destination_type: destinationType,
    destination_id: String(body.destinationId ?? "").trim(),
    destination_url: String(body.destinationUrl ?? "").trim(),
    duration_days: product.durationDays,
    point_cost: product.pointCost,
    status: "pending_review",
  });

  if (insErr) {
    if (insErr.message?.includes("feed_ad_requests")) {
      return NextResponse.json(
        { ok: false, error: "table_missing", hint: "run migration 20261024120000" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  const { error: crErr } = await sb.from("feed_ad_request_creatives").insert(
    creatives.map((c, i) => ({
      request_id: requestId,
      sort_order: i + 1,
      image_url: c.imageUrl,
      alt_text: c.altText,
      headline: c.headline,
    }))
  );
  if (crErr) {
    await sb.from("feed_ad_requests").delete().eq("id", requestId);
    return NextResponse.json({ ok: false, error: crErr.message }, { status: 500 });
  }

  const hold = await holdPointsForFeedAdRequest(sb, {
    userId: auth.userId,
    requestId,
    pointCost: product.pointCost,
  });
  if (!hold.ok) {
    await sb.from("feed_ad_requests").delete().eq("id", requestId);
    return NextResponse.json(
      { ok: false, error: hold.error },
      { status: hold.error === "insufficient_balance" ? 402 : 500 }
    );
  }

  if (hold.holdId) {
    await sb.from("feed_ad_requests").update({ hold_id: hold.holdId }).eq("id", requestId);
  }

  return NextResponse.json({ ok: true, requestId, status: "pending_review" });
}
