import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ensureLocationId } from "@/lib/neighborhood/ensure-location";
import { coalesceNeighborhoodLocationInput } from "@/lib/neighborhood/coalesce-location-input";
import {
  isPhilifeFeedCategorySlugAllowedByTopics,
  loadPhilifeDefaultSectionTopics,
  peekLastPhilifeTopicsColdMetrics,
} from "@/lib/neighborhood/philife-neighborhood-topics";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";

const COMMUNITY_FEED_PERF_HEADER = "x-samarket-community-feed-perf" as const;

export async function GET(req: NextRequest) {
  const tRoute0 = performance.now();
  let authResolveMs = 0;
  let topicsResolveMs = 0;
  let locationEnsureMs = 0;

  const globalFeed = req.nextUrl.searchParams.get("globalFeed") === "1";
  const locationKey = req.nextUrl.searchParams.get("locationKey")?.trim() ?? "";
  const city = req.nextUrl.searchParams.get("city")?.trim() ?? "";
  const district = req.nextUrl.searchParams.get("district")?.trim() ?? "";
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  const categoryRaw = req.nextUrl.searchParams.get("category")?.trim() ?? "";
  const authorIdRaw = req.nextUrl.searchParams.get("authorId")?.trim() ?? "";
  const offsetRaw = req.nextUrl.searchParams.get("offset")?.trim() ?? "0";
  const limitRaw = req.nextUrl.searchParams.get("limit")?.trim() ?? "";
  const neighborOnly = req.nextUrl.searchParams.get("neighborOnly") === "1";

  if (!globalFeed && !locationKey) {
    return NextResponse.json({ ok: false, error: "locationKey_required" }, { status: 400 });
  }

  const [viewerUserId, topics] = await Promise.all([
    (async () => {
      const a = performance.now();
      const r = await getOptionalAuthenticatedUserId();
      authResolveMs = performance.now() - a;
      return r;
    })(),
    (async () => {
      const a = performance.now();
      const r = await loadPhilifeDefaultSectionTopics();
      topicsResolveMs = performance.now() - a;
      return r;
    })(),
  ]);

  let locationId: string | null = null;
  if (!globalFeed) {
    let sb: ReturnType<typeof getSupabaseServer>;
    try {
      sb = getSupabaseServer();
    } catch {
      return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
    }
    const coalesced = coalesceNeighborhoodLocationInput(locationKey, { city, district, name });
    const tLoc0 = performance.now();
    locationId = await ensureLocationId(sb, locationKey, coalesced);
    locationEnsureMs = performance.now() - tLoc0;
  }

  if (neighborOnly && !viewerUserId) {
    return NextResponse.json({ ok: false, error: "neighbor_only_requires_login" }, { status: 401 });
  }

  const authorId = authorIdRaw || null;
  if (authorId && (!viewerUserId || viewerUserId !== authorId)) {
    return NextResponse.json({ ok: false, error: "author_filter_requires_self" }, { status: 403 });
  }

  if (!globalFeed && !locationId) {
    return NextResponse.json({
      ok: true,
      locationId: null,
      posts: [],
      hasMore: false,
      nextOffset: null,
      dbPageLength: 0,
    });
  }

  let category: string | null = null;
  if (categoryRaw) {
    const s = categoryRaw.trim().toLowerCase();
    if (!isPhilifeFeedCategorySlugAllowedByTopics(topics, s)) {
      return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
    }
    category = s;
  }
  const offset = Math.min(Math.max(parseInt(offsetRaw, 10) || 0, 0), 500);
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 40);

  const listResult = await listNeighborhoodFeed({
    ...(globalFeed ? { allLocations: true as const } : { locationId: locationId! }),
    category: category ?? undefined,
    authorUserId: authorId,
    offset,
    limit,
    viewerUserId,
    neighborOnly,
    topics,
  });
  const { posts, hasMore, dbScannedCount, serverCommunityPerf } = listResult;

  const body = {
    ok: true as const,
    locationId: globalFeed ? null : locationId,
    posts,
    hasMore,
    nextOffset: hasMore ? offset + dbScannedCount : null,
    /** 필터 전 DB 행 수 — 클라 offset 계산용(`posts.length`와 다를 수 있음) */
    dbPageLength: dbScannedCount,
  };

  const headers = new Headers();
  /**
   * 비로그인·비개인화 요청만 짧게 캐시 — 로그인 시 차단 필터가 있어 동일 URL이라도 응답이 달라질 수 있음.
   * 워밍·탭 왕복 시 브라우저 재검증으로 RTT 절감.
   */
  if (!neighborOnly && !authorId && !viewerUserId) {
    headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=120");
  }

  if (process.env.NODE_ENV === "development") {
    let responseJsonMs = 0;
    const tJson = performance.now();
    try {
      JSON.stringify(body);
    } catch {
      /* ignore */
    }
    responseJsonMs = performance.now() - tJson;
    const community_route_total_ms = Math.round(performance.now() - tRoute0);
    const topicsDiag = peekLastPhilifeTopicsColdMetrics();
    const topicsBreakdown =
      topicsDiag != null
        ? {
            topics_cache_hit: topicsDiag.topics_cache_hit,
            section_slug_candidate: topicsDiag.section_slug_candidate,
            resolved_slug: topicsDiag.resolved_slug,
            section_id_lookup_skipped: topicsDiag.section_id_lookup_skipped,
            community_topics_query_rounds: topicsDiag.community_topics_query_rounds,
            topics_settings_lookup_ms: topicsDiag.topics_settings_lookup_ms,
            topics_section_resolve_ms: topicsDiag.topics_section_resolve_ms,
            topics_topics_query_ms: topicsDiag.topics_topics_query_ms,
            topics_topics_fallback_ms: topicsDiag.topics_topics_fallback_ms,
            topics_total_ms: topicsDiag.topics_total_ms,
            topics_unified_rpc: topicsDiag.topics_unified_rpc === true,
            /** `runSingleFlight` 대기 등으로 `community_topics_resolve_ms` 가 `topics_total_ms` 보다 클 때 */
            topics_outer_vs_inner_delta_ms: topicsDiag.topics_cache_hit
              ? 0
              : Math.max(0, Math.round(topicsResolveMs) - topicsDiag.topics_total_ms),
          }
        : {};
    headers.set(
      COMMUNITY_FEED_PERF_HEADER,
      JSON.stringify({
        community_route_total_ms,
        community_auth_resolve_ms: Math.round(authResolveMs),
        community_topics_resolve_ms: Math.round(topicsResolveMs),
        community_location_ensure_ms: Math.round(locationEnsureMs),
        community_response_json_ms: Math.round(responseJsonMs),
        global_feed: globalFeed,
        ...topicsBreakdown,
        ...(serverCommunityPerf ?? {}),
      })
    );
  }

  return NextResponse.json(body, { headers });
}
