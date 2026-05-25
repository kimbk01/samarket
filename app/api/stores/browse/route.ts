import { NextResponse } from "next/server";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  loadDeliveryRideTimeSource,
  peekDeliveryRideTimeSource,
  type DeliveryRideTimeSource,
} from "@/lib/delivery/delivery-ops-settings";
import { resolveBrowseRouteOrigin } from "@/lib/stores/browse-route-origin";
import {
  resolveRouteMemoryCacheBypass,
  type RouteCacheBypassReason,
} from "@/lib/http/route-cache-bypass";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import {
  browseListCacheKey,
  peekStoresBrowseCache,
  setStoresBrowseCache,
} from "@/lib/stores/stores-browse-response-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { detectAcceptLanguageAppLanguage } from "@/lib/i18n/language-preference";
import {
  BROWSE_STORE_LIMIT,
  BROWSE_STORE_ROW_SELECTED_COLUMNS,
  logBrowseRoutePerf,
  type StoresBrowseRequestContext,
} from "@/lib/stores/stores-browse-build";
import { buildStoresBrowseLegacy } from "@/lib/stores/fetch-stores-browse-legacy";
import {
  logLegacyStoresBrowseHotpath,
  tryLoadStoresBrowseFromSnapshot,
} from "@/lib/stores/stores-browse-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_BROWSE_HTTP_CACHE_CONTROL = "private, no-store";

function storesBrowseSnapshotHeaders(
  snapshotVia?: string,
  queryWave2Ms = 0,
  rpcRemoved = 1
): Record<string, string> {
  if (!snapshotVia) return {};
  return {
    "x-samarket-stores-browse-snapshot-path": "1",
    "x-samarket-stores-browse-snapshot-via": snapshotVia,
    "x-samarket-stores-browse-query-wave-2-ms": String(queryWave2Ms),
    "x-samarket-stores-browse-rpc-removed": String(rpcRemoved),
  };
}

function browseJsonHeaders(opts: {
  tRoute0: number;
  cache_hit: 0 | 1;
  db_execution_ms: number;
  query_count: number;
  bypass: boolean;
  bypass_reason: RouteCacheBypassReason | null;
  snapshotVia?: string;
  query_wave_2_ms?: number;
  rpc_removed?: number;
}): Record<string, string> {
  return {
    "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL,
    ...storePublicApiPerfHeaders({
      actual_handler_ms: Math.round(devPerfNow() - opts.tRoute0),
      cache_hit: opts.cache_hit,
      db_execution_ms: opts.db_execution_ms,
      query_count: opts.query_count,
      bypass: opts.bypass,
      bypass_reason: opts.bypass_reason,
    }),
    ...storesBrowseSnapshotHeaders(
      opts.snapshotVia,
      opts.query_wave_2_ms ?? 0,
      opts.rpc_removed ?? 1
    ),
  };
}

/**
 * 업종(primary slug) + 세부 주제(sub slug)별 실매장 목록 (서비스 롤, RLS 우회)
 * ?district= — 같은 구/동 우선 정렬(districtRank)
 * ?user_lat= & ?user_lng= — 거리 보조 정렬
 */
export async function GET(req: Request) {
  const tRoute0 = devPerfNow();
  const uiLang = detectAcceptLanguageAppLanguage(req.headers.get("accept-language"));
  const { searchParams } = new URL(req.url);
  const cacheBypass = resolveRouteMemoryCacheBypass(searchParams);
  const storesBrowseBypass =
    searchParams.get("storesBrowseBypass") === "1" &&
    (cacheBypass.bypass || searchParams.get("fresh") === "1");
  const effectiveCacheBypass = cacheBypass.bypass || storesBrowseBypass;

  const primary = (searchParams.get("primary") ?? "").trim().toLowerCase();
  const subRaw = (searchParams.get("sub") ?? "").trim().toLowerCase();
  const wantsAllSubs = subRaw === "" || subRaw === "all";
  const sub = wantsAllSubs ? "all" : subRaw;
  const district = searchParams.get("district")?.trim() || null;
  const regionQ = (searchParams.get("region") ?? "").trim();
  const cityQ = (searchParams.get("city") ?? "").trim();
  const pageQ = (searchParams.get("page") ?? "1").trim() || "1";
  const limitQ = (searchParams.get("limit") ?? String(BROWSE_STORE_LIMIT)).trim() || String(BROWSE_STORE_LIMIT);
  const origin = resolveBrowseRouteOrigin(searchParams);

  if (!primary) {
    return NextResponse.json(
      { ok: false, error: "primary_required", stores: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const browseCacheKey = browseListCacheKey({
    primary,
    sub,
    region: regionQ,
    city: cityQ,
    district: district ?? "",
    geoPart: origin.cacheGeoPart,
    page: pageQ,
    limit: limitQ,
    uiLang,
  });

  const cachedBrowse = effectiveCacheBypass ? null : peekStoresBrowseCache(browseCacheKey);
  if (cachedBrowse != null) {
    const cachedCount = Array.isArray((cachedBrowse as { stores?: unknown }).stores)
      ? (cachedBrowse as { stores: unknown[] }).stores.length
      : 0;
    logBrowseRoutePerf({
      tRoute0,
      cacheKey: browseCacheKey,
      cacheHit: 1,
      authMs: 0,
      dbBaseMs: 0,
      dbRelatedMs: 0,
      transformMs: 0,
      resultCount: cachedCount,
    });
    return NextResponse.json(cachedBrowse, {
      headers: browseJsonHeaders({
        tRoute0,
        cache_hit: 1,
        db_execution_ms: 0,
        query_count: 0,
        bypass: effectiveCacheBypass,
        bypass_reason: storesBrowseBypass ? cacheBypass.reason ?? "fresh" : cacheBypass.reason,
        snapshotVia: "memory_response_cache",
        query_wave_2_ms: 0,
        rpc_removed: 1,
      }),
    });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: true,
        stores: [] as BrowseStoreListItem[],
        meta: { source: "supabase_unconfigured" as const },
      },
      { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } }
    );
  }

  try {
    const ridePeek = peekDeliveryRideTimeSource();
    const deliveryRideTimeSource: DeliveryRideTimeSource = ridePeek ?? "store";
    if (ridePeek == null) {
      void loadDeliveryRideTimeSource(supabase).catch(() => {});
    }

    const ctx: StoresBrowseRequestContext = {
      primary,
      subRaw,
      wantsAllSubs,
      sub,
      district,
      regionQ,
      cityQ,
      uiLang,
      origin,
      deliveryRideTimeSource,
    };

    const snap = await tryLoadStoresBrowseFromSnapshot(supabase, ctx, {
      bypassCounter: storesBrowseBypass,
    });

    if (snap) {
      if (!effectiveCacheBypass && !snap.early) {
        setStoresBrowseCache(browseCacheKey, snap.body);
      }
      logBrowseRoutePerf({
        tRoute0,
        cacheKey: browseCacheKey,
        cacheHit: 0,
        authMs: 0,
        taxonomyCacheHit: false,
        dbBaseMs: snap.dbBaseMs,
        dbRelatedMs: snap.dbRelatedMs,
        transformMs: snap.transformMs,
        resultCount: snap.resultCount,
        v2: snap.v2,
      });
      return NextResponse.json(snap.body, {
        headers: browseJsonHeaders({
          tRoute0,
          cache_hit: 0,
          db_execution_ms: Math.round(snap.dbBaseMs + snap.dbRelatedMs),
          query_count: snap.queryCount,
          bypass: effectiveCacheBypass,
          bypass_reason: storesBrowseBypass ? cacheBypass.reason ?? "fresh" : cacheBypass.reason,
          snapshotVia: snap.snapshotVia,
          query_wave_2_ms: 0,
          rpc_removed: 1,
        }),
      });
    }

    const legacy0 = devPerfNow();
    const legacy = await buildStoresBrowseLegacy(supabase, ctx);
    const legacyMs = devPerfNow() - legacy0;

    if (!legacy.ok) {
      return NextResponse.json(
        { ok: false, stores: [], error: legacy.error },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (legacy.early) {
      logBrowseRoutePerf({
        tRoute0,
        cacheKey: browseCacheKey,
        cacheHit: 0,
        authMs: 0,
        taxonomyCacheHit: legacy.taxonomyCacheHit,
        dbBaseMs: legacy.dbBaseMs,
        dbRelatedMs: 0,
        transformMs: 0,
        resultCount: 0,
      });
      logLegacyStoresBrowseHotpath({
        totalMs: legacyMs,
        dbMs: legacy.dbBaseMs,
        storesFetchMs: legacy.dbBaseMs,
        wave2Ms: 0,
      });
      return NextResponse.json(legacy.body, {
        headers: browseJsonHeaders({
          tRoute0,
          cache_hit: 0,
          db_execution_ms: Math.round(legacy.dbBaseMs),
          query_count: 1,
          bypass: effectiveCacheBypass,
          bypass_reason: cacheBypass.reason,
          query_wave_2_ms: 0,
          rpc_removed: 0,
        }),
      });
    }

    if (!effectiveCacheBypass) {
      setStoresBrowseCache(browseCacheKey, legacy.body);
    }

    logLegacyStoresBrowseHotpath({
      totalMs: legacyMs,
      dbMs: legacy.dbBaseMs + legacy.dbRelatedMs,
      storesFetchMs: legacy.baseQueryMs + legacy.categoryQueryMs,
      wave2Ms: legacy.productPreviewQueryMs,
      orderingMs: legacy.distanceSortMs,
    });

    logBrowseRoutePerf({
      tRoute0,
      cacheKey: browseCacheKey,
      cacheHit: 0,
      authMs: 0,
      taxonomyCacheHit: legacy.taxonomyCacheHit,
      dbBaseMs: legacy.dbBaseMs,
      dbRelatedMs: legacy.dbRelatedMs,
      transformMs: legacy.transformMs,
      resultCount: legacy.resultCount,
      v2: {
        base_query_ms: legacy.baseQueryMs,
        category_query_ms: legacy.categoryQueryMs,
        product_preview_query_ms: legacy.productPreviewQueryMs,
        review_summary_query_ms: 0,
        distance_sort_ms: legacy.distanceSortMs,
        query_count: legacy.queryCount,
        selected_columns: legacy.selectedColumns ?? BROWSE_STORE_ROW_SELECTED_COLUMNS,
      },
    });

    return NextResponse.json(legacy.body, {
      headers: browseJsonHeaders({
        tRoute0,
        cache_hit: 0,
        db_execution_ms: Math.round(legacy.dbBaseMs + legacy.dbRelatedMs),
        query_count: legacy.queryCount,
        bypass: effectiveCacheBypass,
        bypass_reason: cacheBypass.reason,
        query_wave_2_ms: Math.round(legacy.productPreviewQueryMs),
        rpc_removed: 0,
      }),
    });
  } catch (e) {
    console.error("[api/stores/browse]", e);
    return NextResponse.json(
      {
        ok: false,
        stores: [],
        error: e instanceof Error ? e.message : "browse_error",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
