import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listEligibleFeedAdCampaigns } from "@/lib/ads/feed-ad-campaigns-db";
import {
  selectCampaignForPlacement,
  type FeedAdDomain,
  type FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/feed-ads/active?domain=trade&placement=TRADE_HOME&categoryId=&topicSlug=
 * Public eligible campaign for projection (no asset debit).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const domain = (req.nextUrl.searchParams.get("domain") === "community"
    ? "community"
    : "trade") as FeedAdDomain;
  const placement = (req.nextUrl.searchParams.get("placement") ??
    (domain === "trade" ? "TRADE_HOME" : "COMMUNITY_HOME")) as FeedAdPlacement;
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const topicSlug = req.nextUrl.searchParams.get("topicSlug");

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, campaign: null });
  }

  try {
    const all = await listEligibleFeedAdCampaigns(sb, domain);
    const campaign = selectCampaignForPlacement(all, {
      domain,
      placement,
      categoryId,
      topicSlug,
    });
    return NextResponse.json(
      { ok: true, campaign },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } }
    );
  } catch {
    return NextResponse.json({ ok: true, campaign: null });
  }
}
