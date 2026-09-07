import { NextResponse } from "next/server";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED,
  loadDeliveryRideTimeSource,
  loadDeliveryDistanceSettings,
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
import { attachStoresBrowseInsertionMeta } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { detectAcceptLanguageAppLanguage } from "@/lib/i18n/language-preference";
import {
  BROWSE_STORE_LIMIT,
  logBrowseRoutePerf,
  type StoresBrowseRequestContext,
  type StoresBrowseResponseBody,
} from "@/lib/stores/stores-browse-build";
import { parseExplicitStoreBrowseServerSortParam } from "@/lib/stores/store-discovery-browse-sort";
import {
  coerceBrowseSortToCustomerAvailability,
  resolveStoresBrowseCustomerSortAvailability,
} from "@/lib/stores/stores-browse-customer-sort-availability";
import { resolveStoresBrowseScopeCustomerMeta } from "@/lib/stores/product/stores-browse-scope-customer-meta";
import { resolvePopularityWindowDays } from "@/lib/stores/store-discovery-popular-store";
import { tryLoadStoresBrowseFromSnapshot } from "@/lib/stores/stores-browse-snapshot";
import { loadBrowseDiscoveryShelfPayload } from "@/lib/stores/compose-browse-discovery-shelf-stores";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-seed-queries";
import type { SupabaseClient } from "@supabase/supabase-js";

function browseShelfCacheToken(
  shelf: {
    enabled?: boolean;
    position?: string;
    afterN?: number;
    everyN?: number;
    maxShelvesPerPage?: number;
    maxItems?: number;
    sourceMode?: string;
    dataType?: string;
    exposurePrimarySlugs?: string[];
    sourcePrimarySlugs?: string[];
  } | null | undefined
): string {
  if (!shelf?.enabled) return "off";
  return [
    shelf.position,
    shelf.afterN,
    shelf.everyN,
    shelf.maxShelvesPerPage,
    shelf.maxItems,
    shelf.sourceMode,
    shelf.dataType,
    (shelf.exposurePrimarySlugs ?? []).join(","),
    (shelf.sourcePrimarySlugs ?? []).join(","),
  ].join(":");
}

async function attachBrowseDiscoveryShelf(
  sb: SupabaseClient,
  ctx: StoresBrowseRequestContext,
  body: StoresBrowseResponseBody
): Promise<StoresBrowseResponseBody> {
  const config = ctx.discoveryShelf;
  if (!config?.enabled) {
    return {
      ...body,
      meta: {
        ...body.meta,
        discoveryShelf: null,
        customerSortAvailability: ctx.customerSortAvailability ?? body.meta.customerSortAvailability,
      },
    };
  }
  const payload = await loadBrowseDiscoveryShelfPayload({
    sb,
    ctx,
    config,
    organicStoreIds: body.stores.map((s) => s.id),
    allPrimarySlugs: listBrowsePrimaryIndustries().map((p) => p.slug),
  });
  return {
    ...body,
    meta: {
      ...body.meta,
      discoveryShelf: payload,
      customerSortAvailability: ctx.customerSortAvailability ?? body.meta.customerSortAvailability,
    },
  };
}
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
  const explicitSort = parseExplicitStoreBrowseServerSortParam(searchParams.get("sort"));
  const page = Math.max(1, Math.floor(Number(pageQ)) || 1);
  const limit = Math.max(1, Math.min(120, Math.floor(Number(limitQ)) || BROWSE_STORE_LIMIT));
  const origin = resolveBrowseRouteOrigin(searchParams);

  if (!primary) {
    return NextResponse.json(
      { ok: false, error: "primary_required", stores: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
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
    const scopeMeta = await resolveStoresBrowseScopeCustomerMeta(
      supabase,
      primary,
      wantsAllSubs ? null : sub
    ).catch(() => null);
    const customerSortAvailability = resolveStoresBrowseCustomerSortAvailability(
      scopeMeta?.customerSortAvailability
    );
    const sortQ = coerceBrowseSortToCustomerAvailability(explicitSort ?? "default", customerSortAvailability);
    const popularityWindowDays = resolvePopularityWindowDays(scopeMeta?.popularityWindowDays);
    const rankingCriteria = scopeMeta?.rankingCriteria;
    const discoveryShelf = scopeMeta?.discoveryShelf;

    const ridePeek = peekDeliveryRideTimeSource();
    const deliveryRideTimeSource: DeliveryRideTimeSource = ridePeek ?? "store";
    if (ridePeek == null) {
      void loadDeliveryRideTimeSource(supabase).catch(() => {});
    }

    const distanceSettings = await loadDeliveryDistanceSettings(supabase);
    const deliveryDistancePolicy = {
      ...distanceSettings.policy,
      enabled: DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED && distanceSettings.policy.enabled,
    };
    const distancePolicyKey = [
      deliveryDistancePolicy.enabled ? "on" : "off",
      deliveryDistancePolicy.source,
      deliveryDistancePolicy.defaultMaxKm ?? "none",
      Object.entries(distanceSettings.overrides.stores)
        .map(([id, v]) => `${id}:${v.mode}:${v.maxKm ?? "none"}`)
        .sort()
        .join(","),
    ].join("|");
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
      deliveryDistancePolicy,
      storeDistanceOverrides: distanceSettings.overrides,
      sort: sortQ,
      page,
      limit,
      popularityWindowDays,
      rankingCriteria,
      customerSortAvailability,
      discoveryShelf,
    };

    const browseCacheKey = `${browseListCacheKey({
      primary,
      sub,
      region: regionQ,
      city: cityQ,
      district: district ?? "",
      addressPart: origin.cacheAddressPart,
      geoPart: origin.cacheGeoPart,
      page: pageQ,
      limit: limitQ,
      sort: sortQ,
      uiLang,
      popularityWindowDays,
    })}:distance=${distancePolicyKey}:rank=${(rankingCriteria ?? []).join(",")}:csort=${customerSortAvailability.popular ? 1 : 0}${customerSortAvailability.rating ? 1 : 0}${customerSortAvailability.distance ? 1 : 0}:shelf=${browseShelfCacheToken(discoveryShelf)}`;

    const cachedBrowse = effectiveCacheBypass ? null : peekStoresBrowseCache(browseCacheKey);
    if (cachedBrowse != null) {
      const cachedCount = Array.isArray((cachedBrowse as { stores?: unknown }).stores)
        ? (cachedBrowse as { stores: unknown[] }).stores.length
        : 0;
      /**
       * CUT 9 — memory cache may hold organic snapshot while paid/coupon insertion
       * changes. Re-attach live insertion + scope surface so Admin→customer stays fresh.
       */
      let bodyOut = cachedBrowse as StoresBrowseResponseBody;
      try {
        bodyOut = await attachStoresBrowseInsertionMeta(supabase, bodyOut, {
          primarySlug: primary,
          subSlug: wantsAllSubs ? null : sub,
        });
        bodyOut = await attachBrowseDiscoveryShelf(supabase, ctx, bodyOut);
      } catch (e) {
        console.error("[stores/browse] cache-hit insertion refresh", e);
      }
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
      return NextResponse.json(bodyOut, {
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

    const snap = await tryLoadStoresBrowseFromSnapshot(supabase, ctx, {
      bypassCounter: storesBrowseBypass,
    });

    if (snap) {
      let bodyOut = snap.body as StoresBrowseResponseBody;
      if ("stores" in bodyOut) {
        try {
          bodyOut = await attachBrowseDiscoveryShelf(supabase, ctx, bodyOut);
        } catch (e) {
          console.error("[stores/browse] shelf attach", e);
        }
      }
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
      return NextResponse.json(bodyOut, {
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

    return NextResponse.json(
      { ok: false, stores: [], error: "snapshot_unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
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
