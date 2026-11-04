import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchActiveTopFixedAdFeedPostsFromDb } from "@/lib/ads/post-ads-supabase";
import { fetchActiveCommunityPaidExposureFeedPosts } from "@/lib/promotion/community-paid-exposure-feed";
import type { ActiveAdFeedItem, ActiveAdsResponse, AdFeedPost } from "@/lib/ads/types";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/active?boardKey=plife&topic=
 * Community TOP pin — canonical: point_promotion_orders (domain=community).
 * 응답: 남은 기간(endAt) 없음 · `feedPost` = 일반 목록 카드 값 (커뮤니티 상위노출 표시 재설계 2026-11-04).
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

    const rawAds = [...byPost.values()];
    // 일반 목록과 같은 카드 값 — 같은 조회 함수(`listNeighborhoodFeed`)·같은 변환·같은 차단/숨김 규칙
    const viewerUserId = await getOptionalAuthenticatedUserId().catch(() => null);
    const feed = rawAds.length
      ? await listNeighborhoodFeed({
          allLocations: true,
          postIds: rawAds.map((a) => a.postId),
          viewerUserId,
        }).catch(() => null)
      : null;
    const feedPostById = new Map((feed?.posts ?? []).map((p) => [String(p.id), p]));
    const ads: ActiveAdFeedItem[] = rawAds.map(({ endAt: _endAt, ...rest }) => ({
      ...rest,
      feedPost: feedPostById.get(String(rest.postId)) ?? null,
    }));
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
