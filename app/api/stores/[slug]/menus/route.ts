import { NextResponse } from "next/server";
import { resolveRouteMemoryCacheBypass } from "@/lib/http/route-cache-bypass";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  buildDeliveryMenusApiBreakdown,
  logDeliveryMenusApiBreakdown,
} from "@/lib/stores/delivery-menus-api-breakdown";
import { fetchStoreMenusCatalog, type StoreMenusCatalogBody } from "@/lib/stores/fetch-store-menus-catalog";
import { logMenusColdFillDeepBreakdownRoute } from "@/lib/stores/menus-cold-fill-deep-breakdown";
import { logSnapshotSwrAnalysis } from "@/lib/stores/snapshot-swr-analysis";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import {
  readStoreMenusPublicServerCache,
  runStoreMenusPublicServerSingleFlight,
  scheduleStoreMenusRouteMemoryRevalidate,
  writeStoreMenusPublicServerCache,
  type StoreMenusRouteMemoryRead,
} from "@/lib/stores/store-menus-public-server-cache";
import { storeMenusSnapshotSignoffHeaders } from "@/lib/http/snapshot-route-signoff-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_UNCONFIGURED = {
  ok: true,
  store: null,
  products: [],
  recommendedProductIds: [],
  popularProductIds: [],
  recommendedProducts: [],
  popularProducts: [],
  categories: [],
  meta: { source: "supabase_unconfigured" as const, canSell: false, menu_sold_out_bottom: false },
};

function responseStatusForMenusBody(body: StoreMenusCatalogBody & { error?: string }): number {
  if (body.ok === false) return 500;
  if (body.store === null) return 404;
  return 200;
}

function logRouteMemorySwrAnalysis(
  decoded: string,
  memRead: StoreMenusRouteMemoryRead
): void {
  if (!memRead.hit) {
    if (memRead.reason === "hard_stale") {
      logSnapshotSwrAnalysis({
        slug: decoded,
        memory_hard_stale: true,
        stale_age_ms: memRead.ageMs,
        refresh_reason: "hard_stale_miss",
        memory_hit: false,
        memory_soft_stale_hit: false,
        background_refresh_started: false,
        background_refresh_finished: false,
        snapshot_lookup_skipped: false,
        served_stale: false,
        response_returned_before_refresh: false,
      });
    }
    return;
  }
  logSnapshotSwrAnalysis({
    slug: decoded,
    memory_hit: !memRead.stale,
    memory_soft_stale_hit: memRead.stale,
    memory_hard_stale: false,
    background_refresh_started: false,
    background_refresh_finished: false,
    snapshot_lookup_skipped: true,
    snapshot_lookup_ms: 0,
    stale_age_ms: memRead.ageMs,
    served_stale: memRead.stale,
    response_returned_before_refresh: memRead.stale,
    refresh_reason: memRead.stale ? "soft_stale_expired" : null,
  });
}

function createStoreMenusSwrRefreshFetcher(decoded: string) {
  return async () => {
    const sb = tryGetSupabaseForStores();
    if (!sb) return null;
    const result = await fetchStoreMenusCatalog(sb, decoded, performance.now());
    if (!result.ok) return null;
    return {
      body: result.body as Record<string, unknown>,
      snapshotVia: result.snapshotVia,
    };
  };
}

function tryServeMenusFromRouteMemoryCache(input: {
  decoded: string;
  startedAt: number;
  scheduleSoftStaleRevalidate: boolean;
}): {
  body: Record<string, unknown>;
  status: number;
  cacheLookupMs: number;
  snapshotVia?: "counter_row" | "unified_rpc";
} | null {
  const cacheLookup0 = performance.now();
  const memRead = readStoreMenusPublicServerCache(input.decoded);
  const cacheLookupMs = Math.round(performance.now() - cacheLookup0);
  logRouteMemorySwrAnalysis(input.decoded, memRead);
  if (!memRead.hit) return null;

  if (memRead.stale && input.scheduleSoftStaleRevalidate) {
    scheduleStoreMenusRouteMemoryRevalidate(
      input.decoded,
      createStoreMenusSwrRefreshFetcher(input.decoded)
    );
  }

  const body = memRead.body;
  const bodyText = JSON.stringify(body);
  logDeliveryMenusApiBreakdown(
    buildDeliveryMenusApiBreakdown({
      slug: input.decoded,
      startedAt: input.startedAt,
      marks: { authDone: input.startedAt, storeDone: input.startedAt, payloadDone: performance.now() },
      payloadBuildMs: 0,
      responseSizeBytes: new TextEncoder().encode(bodyText).length,
      queryCount: 0,
      cacheHit: true,
    })
  );
  logMenusColdFillDeepBreakdownRoute({
    handlerT0: input.startedAt,
    auth_ms: 0,
    memory_cache_lookup_ms: cacheLookupMs,
    payload_build_ms: 0,
    cache_hit: true,
    slug: input.decoded,
    body: body as StoreMenusCatalogBody,
    snapshotVia: "route_memory_hit",
    worst_stage: "route_memory_hit",
  });

  return {
    body,
    status: responseStatusForMenusBody(body as StoreMenusCatalogBody),
    cacheLookupMs,
    snapshotVia: memRead.snapshotVia,
  };
}

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
  const storeMenusBypass =
    new URL(req.url).searchParams.get("storeMenusBypass") === "1" &&
    process.env.NODE_ENV === "development";
  const effectiveCacheBypass = cacheBypass.bypass || storeMenusBypass;
  const perfHeaders = (opts: {
    cache_hit: 0 | 1;
    db_execution_ms: number;
    query_count: number;
  }) =>
    storePublicApiPerfHeaders({
      startedAt,
      bypass: effectiveCacheBypass,
      bypass_reason: storeMenusBypass ? cacheBypass.reason ?? "fresh" : cacheBypass.reason,
      ...opts,
    });

  if (!effectiveCacheBypass) {
    const memoryServed = tryServeMenusFromRouteMemoryCache({
      decoded,
      startedAt,
      scheduleSoftStaleRevalidate: true,
    });
    if (memoryServed) {
      return NextResponse.json(memoryServed.body, {
        status: memoryServed.status,
        headers: {
          ...perfHeaders({ cache_hit: 1, db_execution_ms: 0, query_count: 0 }),
          ...storeMenusSnapshotSignoffHeaders({
            snapshotVia: memoryServed.snapshotVia,
            cacheHit: true,
          }),
        },
      });
    }
  } else {
    logSnapshotSwrAnalysis({
      slug: decoded,
      refresh_reason: "cache_bypass",
      memory_hit: false,
      memory_soft_stale_hit: false,
      memory_hard_stale: false,
      background_refresh_started: false,
      background_refresh_finished: false,
      snapshot_lookup_skipped: false,
      served_stale: false,
      response_returned_before_refresh: false,
    });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(EMPTY_UNCONFIGURED);
  }

  try {
    let coldDbMs = 0;
    let coldQueryCount = 0;
    let menusSnapshotVia: "counter_row" | "unified_rpc" | undefined;
    let routeMemoryHit = false;

    const payload = await runStoreMenusPublicServerSingleFlight(decoded, async () => {
      let memoryCacheLookupMs = 0;
      if (!effectiveCacheBypass) {
        const memoryServed = tryServeMenusFromRouteMemoryCache({
          decoded,
          startedAt,
          scheduleSoftStaleRevalidate: true,
        });
        if (memoryServed) {
          routeMemoryHit = true;
          return {
            body: memoryServed.body,
            status: memoryServed.status,
            routeMemoryHit: true as const,
          };
        }
        const cacheLookup0 = performance.now();
        readStoreMenusPublicServerCache(decoded);
        memoryCacheLookupMs = Math.round(performance.now() - cacheLookup0);
      }

      const result = await fetchStoreMenusCatalog(sb, decoded, startedAt);
      coldDbMs = result.dbMs;
      coldQueryCount = result.queryCount;

      if (!result.ok) {
        return { body: result.body, status: result.status, routeMemoryHit: false as const };
      }

      if (result.snapshotVia) menusSnapshotVia = result.snapshotVia;

      const payloadStart = performance.now();
      if (!effectiveCacheBypass) {
        writeStoreMenusPublicServerCache(decoded, result.body, result.snapshotVia);
      }
      result.marks.payloadDone = performance.now();
      const payloadBuildMs = Math.round(performance.now() - payloadStart);
      const bodyText = JSON.stringify(result.body);
      logDeliveryMenusApiBreakdown(
        buildDeliveryMenusApiBreakdown({
          slug: decoded,
          startedAt,
          marks: result.marks,
          payloadBuildMs,
          responseSizeBytes: new TextEncoder().encode(bodyText).length,
          queryCount: result.queryCount,
          cacheHit: false,
        })
      );
      logMenusColdFillDeepBreakdownRoute({
        handlerT0: startedAt,
        auth_ms: Math.round((result.marks.authDone ?? startedAt) - startedAt),
        memory_cache_lookup_ms: memoryCacheLookupMs,
        payload_build_ms: payloadBuildMs,
        cache_hit: false,
        slug: decoded,
        body: result.body,
        snapshotVia: result.snapshotVia ?? "unknown",
        worst_stage: result.snapshotVia === "counter_row" ? "store_menus_snapshot_row" : "store_menus_unified_rpc",
      });

      return { body: result.body, status: 200, routeMemoryHit: false as const };
    });

    return NextResponse.json(payload.body, {
      status: payload.status,
      headers: {
        ...perfHeaders({
          cache_hit: routeMemoryHit || payload.routeMemoryHit ? 1 : 0,
          db_execution_ms: routeMemoryHit || payload.routeMemoryHit ? 0 : coldDbMs,
          query_count: routeMemoryHit || payload.routeMemoryHit ? 0 : coldQueryCount,
        }),
        ...storeMenusSnapshotSignoffHeaders({
          snapshotVia: routeMemoryHit || payload.routeMemoryHit ? undefined : menusSnapshotVia,
          cacheHit: routeMemoryHit || payload.routeMemoryHit,
        }),
      },
    });
  } catch (e) {
    console.error("[api/stores/slug/menus]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
