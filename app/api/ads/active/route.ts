import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchActiveTopFixedAdFeedPostsFromDb } from "@/lib/ads/post-ads-supabase";
import { fetchActiveCommunityPromotedPostIds } from "@/lib/promotion/community-paid-exposure-feed";
import { PROMOTED_TOP_PINS_MAX } from "@/lib/promotion/promoted-top-pins";
import type { ActiveAdFeedItem, ActiveAdsResponse } from "@/lib/ads/types";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";
import { ensureLocationId } from "@/lib/neighborhood/ensure-location";
import { coalesceNeighborhoodLocationInput } from "@/lib/neighborhood/coalesce-location-input";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 위쪽 카드 값을 찾을 때 한 번에 읽는 글 수 · 최대 회차 (보는 회원에게 안 보이는 글을 건너뛰기 위함) */
const TOP_LOOKUP_CHUNK = 20;
const TOP_LOOKUP_MAX_ROUNDS = 5;

/**
 * GET /api/ads/active?boardKey=plife&topic=[&locationKey=&city=&district=&name=]
 * Community TOP pin — canonical: point_promotion_orders (domain=community).
 * 응답: 남은 기간(endAt)·결제 시각(startAt)·순위(priority) 없음 · `adId` = 글 id (광고 ② PV-4 2026-11-04).
 * 광고 ② PB-21: 광고 중인 글 **전체**(안전 상한 500) — 위쪽 3개만 `feedPost`(일반 목록과 같은 카드 값), 나머지는 id 만.
 * 광고 ② D-11: `locationKey` 가 있으면(동네 탭) 그 동네 글만 위쪽 카드 값을 받는다. 다른 탭은 지역 조건 없음.
 * Legacy post_ads active rows merged for read compatibility (deduped by postId, 전체 주제일 때만).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const boardKey = sp.get("boardKey")?.trim() || "plife";
  const topic = sp.get("topic")?.trim() || sp.get("category")?.trim() || "";
  const locationKey = sp.get("locationKey")?.trim() ?? "";

  try {
    const sb = getSupabaseServer();
    const canonical = await fetchActiveCommunityPromotedPostIds(sb, { topicFilter: topic });
    const legacy = await fetchActiveTopFixedAdFeedPostsFromDb(sb, boardKey);

    const postIds: string[] = [];
    const seen = new Set<string>();
    const push = (id: string) => {
      const pid = id.trim();
      if (!pid || seen.has(pid)) return;
      seen.add(pid);
      postIds.push(pid);
    };
    if (canonical.ok) for (const it of canonical.items) push(it.postId);
    // Legacy rows lack topic — 전체 주제(COMMUNITY_HOME)에서만 합친다.
    if (legacy.ok && !topic) for (const ad of legacy.ads) push(String(ad.postId ?? ""));

    /** D-11: 동네 탭 — 그 동네(locations.id) 글만 위쪽 */
    let locationId: string | null = null;
    if (locationKey) {
      const coalesced = coalesceNeighborhoodLocationInput(locationKey, {
        city: sp.get("city")?.trim() ?? "",
        district: sp.get("district")?.trim() ?? "",
        name: sp.get("name")?.trim() ?? "",
      });
      locationId = await ensureLocationId(sb, locationKey, coalesced).catch(() => null);
    }
    const scope = locationKey
      ? locationId
        ? ({ locationId } as const)
        : null
      : ({ allLocations: true } as const);

    // 일반 목록과 같은 카드 값 — 같은 조회 함수(`listNeighborhoodFeed`)·같은 변환·같은 차단/숨김 규칙
    const viewerUserId = await getOptionalAuthenticatedUserId().catch(() => null);
    const feedPostById = new Map<string, NeighborhoodFeedPostDTO>();
    if (scope && postIds.length > 0) {
      for (let round = 0; round < TOP_LOOKUP_MAX_ROUNDS; round++) {
        if (feedPostById.size >= PROMOTED_TOP_PINS_MAX) break;
        const chunk = postIds.slice(round * TOP_LOOKUP_CHUNK, (round + 1) * TOP_LOOKUP_CHUNK);
        if (chunk.length === 0) break;
        const feed = await listNeighborhoodFeed({ ...scope, postIds: chunk, viewerUserId }).catch(() => null);
        const byId = new Map((feed?.posts ?? []).map((p) => [String(p.id), p]));
        for (const id of chunk) {
          if (feedPostById.size >= PROMOTED_TOP_PINS_MAX) break;
          const p = byId.get(id);
          if (p) feedPostById.set(id, p);
        }
      }
    }

    const ads: ActiveAdFeedItem[] = postIds.map((postId) => ({
      adId: postId,
      postId,
      feedPost: feedPostById.get(postId) ?? null,
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
