import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchActiveTopFixedAdFeedPostsFromDb } from "@/lib/ads/post-ads-supabase";
import { fetchActiveCommunityPaidExposureFeedPosts } from "@/lib/promotion/community-paid-exposure-feed";
import type { ActiveAdsResponse, AdFeedPost } from "@/lib/ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/active?boardKey=plife&topic=
 * Community TOP pin — canonical: point_promotion_orders (domain=community).
 * Legacy post_ads active rows merged for read compatibility (deduped by postId).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const boardKey = req.nextUrl.searchParams.get("boardKey")?.trim() || "plife";
  const topic =
    req.nextUrl.searchParams.get("topic")?.trim() ||
    req.nextUrl.searchParams.get("category")?.trim() ||
    "";

  try {
    const sb = getSupabaseServer();
    const canonical = await fetchActiveCommunityPaidExposureFeedPosts(sb, {
      topicFilter: topic,
    });
    const legacy = await fetchActiveTopFixedAdFeedPostsFromDb(sb, boardKey);

    const byPost = new Map<string, AdFeedPost>();
    if (canonical.ok) {
      for (const ad of canonical.ads) {
        byPost.set(ad.postId, ad);
      }
    }
    if (legacy.ok) {
      for (const ad of legacy.ads) {
        // Topic filter for legacy: only when we can match via already-filtered canonical prefer.
        // Legacy rows lack topic in AdFeedPost — apply only on COMMUNITY_HOME (no topic filter).
        if (topic) continue;
        if (!byPost.has(ad.postId)) byPost.set(ad.postId, ad);
      }
    }

    const ads = [...byPost.values()];
    const res: ActiveAdsResponse = {
      ok: true,
      ads,
      meta: {
        source: canonical.ok ? "point_promotion_orders" : legacy.ok ? "supabase" : "empty",
      },
    };
    return NextResponse.json(res, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch {
    const res: ActiveAdsResponse = {
      ok: true,
      ads: [],
      meta: { source: "empty", hint: "서버 설정(Supabase)이 없어 광고를 조회하지 못했습니다." },
    };
    return NextResponse.json(res, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
