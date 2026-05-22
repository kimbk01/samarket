import { NextResponse } from "next/server";
import { resolveRouteMemoryCacheBypass } from "@/lib/http/route-cache-bypass";
import { fetchStoreSummaryPublic } from "@/lib/stores/fetch-store-summary-public";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import { logStoreSummaryApiPerf } from "@/lib/stores/store-summary-api-perf-log";
import {
  readStoreSummaryPublicServerCache,
  runStoreSummaryPublicServerSingleFlight,
  writeStoreSummaryPublicServerCache,
} from "@/lib/stores/store-summary-public-server-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_UNCONFIGURED = {
  ok: true,
  store: null,
  meta: { source: "supabase_unconfigured" as const },
};

/**
 * 매장 상단·배달 메타 전용 — 메뉴 행 없음 (`/menus` 분리).
 * 45s 서버 메모리 캐시 + slug singleflight.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const startedAt = performance.now();
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const cacheBypass = resolveRouteMemoryCacheBypass(new URL(req.url).searchParams);
  const perfHeaders = (opts: {
    cache_hit: 0 | 1;
    db_execution_ms: number;
    query_count: number;
  }) =>
    storePublicApiPerfHeaders({
      startedAt,
      bypass: cacheBypass.bypass,
      bypass_reason: cacheBypass.reason,
      ...opts,
    });

  if (!cacheBypass.bypass) {
    const cached = readStoreSummaryPublicServerCache(decoded);
    if (cached) {
      logStoreSummaryApiPerf({
        slug: decoded,
        total_ms: Math.round(performance.now() - startedAt),
        db_ms: 0,
        cache_hit: 1,
        query_count: 0,
      });
      return NextResponse.json(cached, {
        status: 200,
        headers: perfHeaders({ cache_hit: 1, db_execution_ms: 0, query_count: 0 }),
      });
    }
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(EMPTY_UNCONFIGURED);
  }

  try {
    let coldDbMs = 0;
    let coldQueryCount = 0;

    const payload = await runStoreSummaryPublicServerSingleFlight(decoded, async () => {
      if (!cacheBypass.bypass) {
        const memHit = readStoreSummaryPublicServerCache(decoded);
        if (memHit) return { body: memHit, status: 200 as const };
      }

      const result = await fetchStoreSummaryPublic(sb, decoded);
      coldDbMs = result.dbMs;
      coldQueryCount = result.queryCount;
      if (!cacheBypass.bypass && result.status === 200 && result.body.ok) {
        writeStoreSummaryPublicServerCache(decoded, result.body);
      }
      return { body: result.body, status: result.status };
    });

    logStoreSummaryApiPerf({
      slug: decoded,
      total_ms: Math.round(performance.now() - startedAt),
      db_ms: coldDbMs,
      cache_hit: 0,
      query_count: coldQueryCount,
    });

    if (payload.body.ok === false && payload.status === 500) {
      return NextResponse.json(payload.body, { status: 500 });
    }
    return NextResponse.json(payload.body, {
      status: payload.status,
      headers: perfHeaders({
        cache_hit: 0,
        db_execution_ms: coldDbMs,
        query_count: coldQueryCount,
      }),
    });
  } catch (e) {
    console.error("[api/stores/slug/summary]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
