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
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";
import {
  neighborhoodFeedDedupeUrlKey,
  recordNeighborhoodFeedCompletion,
} from "@/lib/neighborhood/neighborhood-feed-duplicate-window";
import {
  peekNeighborhoodFeedShortTtlMetrics,
  runNeighborhoodFeedWithShortTtl,
  type NeighborhoodFeedExecuteResult,
} from "@/lib/neighborhood/neighborhood-feed-short-ttl-server";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      pagingOffsetAdvance: 0,
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
  const sortRaw = req.nextUrl.searchParams.get("sort")?.trim() ?? "";
  const feedSort: ReturnType<typeof normalizeFeedSort> = (() => {
    if (!category) {
      if (!sortRaw) return "latest";
      return normalizeFeedSort(sortRaw);
    }
    const c = category.toLowerCase();
    if ((c === "recommend" || c === "recommended") && !sortRaw) return "recommended";
    return normalizeFeedSort(sortRaw || undefined);
  })();

  const dedupeKey = neighborhoodFeedDedupeUrlKey(req.nextUrl.pathname, req.nextUrl.searchParams);
  const cacheKey = `${viewerUserId ?? "anon"}::${dedupeKey}`;

  const outcome = await runNeighborhoodFeedWithShortTtl({
    cacheKey,
    ttlMs: 1200,
    execute: async (): Promise<NeighborhoodFeedExecuteResult> => {
      const listQueryKey = [
        "community:neighborhood-feed:list",
        viewerUserId ?? "anon",
        globalFeed ? "global" : "local",
        globalFeed ? "all" : locationId ?? "none",
        category ?? "all",
        authorId ?? "all",
        neighborOnly ? "neighbor-only" : "all-users",
        String(offset),
        String(limit),
        feedSort,
      ].join(":");
      const listResult = await runSingleFlight(listQueryKey, async () =>
        listNeighborhoodFeed({
          ...(globalFeed ? { allLocations: true as const } : { locationId: locationId! }),
          category: category ?? undefined,
          authorUserId: authorId,
          offset,
          limit,
          viewerUserId,
          neighborOnly,
          feedSort,
          topics,
        })
      );
      const { posts, hasMore, pagingOffsetAdvance, serverCommunityPerf } = listResult;

      const perf = serverCommunityPerf;
      const queryMs = perf
        ? Math.round(perf.main_query_filter_prepare_ms + perf.main_query_db_ms)
        : 0;
      const normalizeMs = perf ? Math.round(perf.main_query_postprocess_ms) : 0;
      const enrichMs = perf ? Math.round(perf.community_query_related_ms) : 0;

      const body = {
        ok: true as const,
        locationId: globalFeed ? null : locationId,
        posts,
        hasMore,
        nextOffset: hasMore ? offset + pagingOffsetAdvance : null,
        dbPageLength: pagingOffsetAdvance,
        pagingOffsetAdvance,
      };

      const headers = new Headers();
      if (!neighborOnly && !authorId && !viewerUserId) {
        headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=120");
      }

      if (process.env.NODE_ENV === "development") {
        let responseJsonMs = 0;
        const tJson = performance.now();
        let serializedUtf8Bytes = 0;
        try {
          const jsonText = JSON.stringify(body);
          serializedUtf8Bytes = Buffer.byteLength(jsonText, "utf8");
        } catch {
          /* ignore */
        }
        responseJsonMs = performance.now() - tJson;
        const community_route_total_ms = Math.round(performance.now() - tRoute0);
        const duplicateWindowCount = recordNeighborhoodFeedCompletion(dedupeKey);
        const payloadKb =
          serializedUtf8Bytes > 0 ? Math.round((serializedUtf8Bytes / 1024) * 1000) / 1000 : 0;
        const serializeMsRounded = Math.round(responseJsonMs * 100) / 100;
        const apiSteps = {
          total_ms: community_route_total_ms,
          auth_ms: Math.round(authResolveMs),
          query_ms: queryMs,
          normalize_ms: normalizeMs,
          enrich_ms: enrichMs,
          serialize_ms: serializeMsRounded,
          payload_kb: payloadKb,
          result_count: posts.length,
          duplicate_window_count: duplicateWindowCount,
        };
        console.info("[philife-feed-api-steps]", apiSteps);
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
            community_response_json_ms: serializeMsRounded,
            philife_feed_payload_kb: payloadKb,
            philife_feed_duplicate_window_count: duplicateWindowCount,
            philife_feed_dedupe_key: dedupeKey,
            philife_feed_result_transform_ms: perf ? Math.round(perf.community_result_transform_ms) : null,
            philife_feed_steps_ms: {
              query_ms: queryMs,
              normalize_ms: normalizeMs,
              enrich_ms: enrichMs,
            },
            global_feed: globalFeed,
            ...topicsBreakdown,
            ...(serverCommunityPerf ?? {}),
          })
        );
      }

      return {
        body: body as unknown as Record<string, unknown>,
        headers,
      };
    },
  });

  if (process.env.NODE_ENV === "development") {
    const m = peekNeighborhoodFeedShortTtlMetrics();
    const hit = outcome.source !== "network";
    console.info("[philife-feed-short-ttl]", {
      philife_feed_short_ttl_hit: hit,
      philife_feed_short_ttl_miss: !hit,
      philife_feed_reused_response: hit,
      philife_feed_network_fetch: outcome.source === "network",
      source: outcome.source,
      server_metrics: m,
    });
  }

  if (outcome.source !== "network") {
    const raw = outcome.headers.get(COMMUNITY_FEED_PERF_HEADER);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed.community_route_total_ms = Math.round(performance.now() - tRoute0);
        parsed.philife_feed_short_ttl_served = outcome.source;
        outcome.headers.set(COMMUNITY_FEED_PERF_HEADER, JSON.stringify(parsed));
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json(outcome.body, { headers: outcome.headers });
}
