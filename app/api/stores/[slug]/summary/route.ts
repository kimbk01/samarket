import { NextResponse } from "next/server";
import { resolveRouteMemoryCacheBypass } from "@/lib/http/route-cache-bypass";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  asStoreSummaryPublicShared,
  composeStoreSummaryPublicForViewer,
  fetchStoreSummaryPublicShared,
  type StoreSummaryPublicShared,
} from "@/lib/stores/fetch-store-summary-public";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import { logStoreSummaryApiPerf } from "@/lib/stores/store-summary-api-perf-log";
import {
  readStoreSummaryPublicServerCache,
  runStoreSummaryPublicServerSingleFlight,
  writeStoreSummaryPublicServerCache,
} from "@/lib/stores/store-summary-public-server-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { syncStorePublicReadCachesWithSharedGeneration } from "@/lib/stores/store-public-shared-cache-generation";

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
 * CRT-01 — 캐시·singleflight 에는 보는 사람과 무관한 본문만 담고, viewer 필드(본인 매장·주문 가능·찜)는 요청마다 합성.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const startedAt = performance.now();
  /** DEF-64 — 인스턴스 공통 세대 확인 (창 내 메모리 비교만, 무DB) 후 메모리 캐시 조회 */
  const sharedGenerationSync = syncStorePublicReadCachesWithSharedGeneration();
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const cacheBypass = resolveRouteMemoryCacheBypass(new URL(req.url).searchParams);
  await sharedGenerationSync;
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

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(EMPTY_UNCONFIGURED);
  }

  try {
    const viewerIdP = getRouteUserId();
    const cachedShared = cacheBypass.bypass
      ? null
      : asStoreSummaryPublicShared(readStoreSummaryPublicServerCache(decoded));
    if (cachedShared) {
      const viewerId = await viewerIdP;
      const t0 = performance.now();
      const composed = await composeStoreSummaryPublicForViewer(sb, cachedShared, viewerId);
      const viewerDbMs = Math.round(performance.now() - t0);
      logStoreSummaryApiPerf({
        slug: decoded,
        total_ms: Math.round(performance.now() - startedAt),
        db_ms: viewerDbMs,
        cache_hit: 1,
        query_count: composed.queryCount,
      });
      return NextResponse.json(composed.body, {
        status: 200,
        headers: perfHeaders({
          cache_hit: 1,
          db_execution_ms: viewerDbMs,
          query_count: composed.queryCount,
        }),
      });
    }

    let coldDbMs = 0;
    let coldQueryCount = 0;

    const payload = await runStoreSummaryPublicServerSingleFlight(decoded, async () => {
      if (!cacheBypass.bypass) {
        const memHit = asStoreSummaryPublicShared(readStoreSummaryPublicServerCache(decoded));
        if (memHit) return { shared: memHit, body: memHit.body, status: 200 };
      }

      const result = await fetchStoreSummaryPublicShared(sb, decoded);
      coldDbMs = result.dbMs;
      coldQueryCount = result.queryCount;
      if (!cacheBypass.bypass && result.status === 200 && result.shared) {
        writeStoreSummaryPublicServerCache(decoded, result.shared);
      }
      return { shared: result.shared, body: result.body, status: result.status };
    });

    let body = payload.body;
    const shared: StoreSummaryPublicShared | null = payload.shared;
    if (shared) {
      const viewerId = await viewerIdP;
      const t0 = performance.now();
      const composed = await composeStoreSummaryPublicForViewer(sb, shared, viewerId);
      coldDbMs += Math.round(performance.now() - t0);
      coldQueryCount += composed.queryCount;
      body = composed.body;
    }

    logStoreSummaryApiPerf({
      slug: decoded,
      total_ms: Math.round(performance.now() - startedAt),
      db_ms: coldDbMs,
      cache_hit: 0,
      query_count: coldQueryCount,
    });

    if (body.ok === false && payload.status === 500) {
      return NextResponse.json(body, { status: 500 });
    }
    return NextResponse.json(body, {
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
