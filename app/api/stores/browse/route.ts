import { NextResponse } from "next/server";
import { resolveDeliveryMenuStoreFilter } from "@/lib/stores/delivery-menus/load-delivery-menus.server";
import { deliveryMenuStoreFilterCacheToken } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { STORE_PUBLIC_API_ERROR_CODES } from "@/lib/stores/store-public-api-error-codes";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { syncStorePublicReadCachesWithSharedGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED,
  loadDeliveryRideTimeSource,
  loadDeliveryDistanceSettings,
  peekDeliveryRideTimeSource,
  type DeliveryRideTimeSource,
} from "@/lib/delivery/delivery-ops-settings";
import { browseRouteOriginFromDeliveryOrigin } from "@/lib/stores/browse-route-origin";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { resolveDeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  resolveRouteMemoryCacheBypass,
  type RouteCacheBypassReason,
} from "@/lib/http/route-cache-bypass";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import {
  browseListCacheKey,
  browseShelfSourceCacheKey,
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
import {
  listBrowseScopePolicyRowsWithLastGood,
  resolveStoresBrowseScopeCustomerMetaFromRows,
  type StoresBrowseScopePolicyRows,
} from "@/lib/stores/product/stores-browse-scope-customer-meta";
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

type BrowseShelfRequestInput = {
  /** 5-C BR-02 — 선반 소스 캐시 키 (캐시 우회 요청이면 null) */
  cacheKey: string | null;
  /** 같은 요청에서 읽은 정책 행 (실패 시 null → 게이트 없음 — 기존 삽입 메타 실패 시와 동일) */
  scopePolicyRows: StoresBrowseScopePolicyRows | null;
};

async function attachBrowseDiscoveryShelf(
  sb: SupabaseClient,
  ctx: StoresBrowseRequestContext,
  body: StoresBrowseResponseBody,
  shelfInput: BrowseShelfRequestInput
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
    cacheKey: shelfInput.cacheKey,
    isSourcePrimaryEnabled: (sourcePrimary) => {
      const rows = shelfInput.scopePolicyRows;
      if (!rows) return true;
      return resolveStoresBrowseScopeCustomerMetaFromRows(rows, sourcePrimary, null).enabled;
    },
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
 * Logged-in: master delivery address (same SSOT as home-feed)
 * Guest: optional ?user_lat=&user_lng= for distance sort only (not OOR eligibility)
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
  const subRawParam = (searchParams.get("sub") ?? "").trim().toLowerCase();
  const subParam = subRawParam === "" || subRawParam === "all" ? "all" : subRawParam;
  /** WP1 — 고객 「메뉴」 2단 탭 (`?menu=`). 있으면 `sub` 보다 우선 */
  const menuQ = (searchParams.get("menu") ?? "").trim().toLowerCase();
  const district = searchParams.get("district")?.trim() || null;
  const regionQ = (searchParams.get("region") ?? "").trim();
  const cityQ = (searchParams.get("city") ?? "").trim();
  const pageQ = (searchParams.get("page") ?? "1").trim() || "1";
  const limitQ = (searchParams.get("limit") ?? String(BROWSE_STORE_LIMIT)).trim() || String(BROWSE_STORE_LIMIT);
  const explicitSort = parseExplicitStoreBrowseServerSortParam(searchParams.get("sort"));
  const page = Math.max(1, Math.floor(Number(pageQ)) || 1);
  const limit = Math.max(1, Math.min(120, Math.floor(Number(limitQ)) || BROWSE_STORE_LIMIT));

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

  /** DEF-64 — 인스턴스 공통 세대 확인을 먼저 시작해 아래 await 들과 겹친다 (무DB). */
  const sharedGenerationSync = syncStorePublicReadCachesWithSharedGeneration();
  /** 메뉴 → 매장 필터 조회도 아래 await 들과 겹친다. 실패 = 메뉴 없음(업종 경로 그대로). */
  const menuResolvePromise = menuQ
    ? resolveDeliveryMenuStoreFilter(supabase, { primarySlug: primary, menuSlug: menuQ }).catch((e: unknown) => {
        console.error("[stores/browse] delivery menu resolve", e);
        return null;
      })
    : Promise.resolve(null);
  /**
   * v4 PERF-06 — origin·업종 정책 행·배달 거리 설정은 서로 독립 → 병렬 (직렬 3단 → 1단).
   * 비로그인은 정책·거리 조회 전에 아래 게이트로 반환 (5-C: 게이트 차단 시 정책·스냅샷 호출 없음 유지 —
   * 비로그인 origin 은 DB 없음). 인증 조회는 origin 안에서 dedupe 된다.
   */
  const viewerUserIdEarly = await getRouteUserId();
  const [deliveryOrigin, scopePolicyRowsEarly, distanceSettingsEarly] = await Promise.all([
    resolveStoreListDeliveryOrigin(supabase, searchParams),
    viewerUserIdEarly ? listBrowseScopePolicyRowsWithLastGood(supabase).catch(() => null) : Promise.resolve(null),
    (viewerUserIdEarly
      ? loadDeliveryDistanceSettings(supabase)
      : Promise.reject(new Error("viewer_gate_blocked"))
    ).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error })
    ),
  ]);
  /**
   * S-07·S-08 — 홈 피드와 같은 배달 열람 게이트. 비로그인·주소 없는 회원은 매장 목록 없이 반환.
   * 응답 메모리 캐시 조회·저장보다 먼저 반환하므로 공유 캐시 키(`addr:none`)에 섞이지 않는다.
   */
  const viewerGate = resolveDeliveryViewerGate(deliveryOrigin);
  if (viewerGate !== "ok") {
    await sharedGenerationSync.catch(() => {});
    return NextResponse.json(
      {
        ok: true,
        stores: [] as BrowseStoreListItem[],
        meta: {
          source: "supabase" as const,
          primary,
          sub: subParam,
          all_topics: subParam === "all",
          viewer_gate: viewerGate,
          origin_source: deliveryOrigin.source,
        },
      },
      { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } }
    );
  }
  const origin = browseRouteOriginFromDeliveryOrigin(deliveryOrigin);
  /**
   * WP1 — 2단 메뉴가 2차 업종 1개만 연결(개별 추가·제외 없음)이면 기존 `sub` 경로와 같은 응답·캐시.
   * 그 외에는 1차 전체(`sub=all`) 후보에서 메뉴 매장만 남긴다.
   */
  const menuResolved = await menuResolvePromise;
  const menuStoreFilter = menuResolved && !menuResolved.singleTopicSlug ? menuResolved.filter : null;
  const subRaw = menuResolved ? (menuResolved.singleTopicSlug ?? "all") : subRawParam;
  const wantsAllSubs = subRaw === "" || subRaw === "all";
  const sub = wantsAllSubs ? "all" : subRaw;

  try {
    /**
     * 5-C BR-02 — 정책 행은 요청당 1회만 읽고 고객 메타·삽입 정책(`scopeMeta` 전달)·선반 소스 게이트가 공유한다.
     */
    const scopePolicyRows = scopePolicyRowsEarly;
    const scopeMeta = scopePolicyRows
      ? resolveStoresBrowseScopeCustomerMetaFromRows(scopePolicyRows, primary, wantsAllSubs ? null : sub)
      : null;
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

    /** 거리 설정 조회 실패는 기존처럼 아래 catch(500 고정 코드)로 */
    if (!distanceSettingsEarly.ok) throw distanceSettingsEarly.error;
    const distanceSettings = distanceSettingsEarly.value;
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
      /** P-05 — 회원 쿠폰 배지 필터 (삽입 메타는 캐시 히트에서도 요청마다 다시 계산). */
      viewerUserId: deliveryOrigin.userId,
      menuStoreFilter,
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
    })}:distance=${distancePolicyKey}:rank=${(rankingCriteria ?? []).join(",")}:csort=${customerSortAvailability.popular ? 1 : 0}${customerSortAvailability.rating ? 1 : 0}${customerSortAvailability.distance ? 1 : 0}:shelf=${browseShelfCacheToken(discoveryShelf)}:menu=${deliveryMenuStoreFilterCacheToken(menuStoreFilter)}`;

    const shelfInput: BrowseShelfRequestInput = {
      cacheKey: effectiveCacheBypass
        ? null
        : browseShelfSourceCacheKey({
            pagePrimary: primary,
            shelfToken: browseShelfCacheToken(discoveryShelf),
            region: regionQ,
            city: cityQ,
            district: district ?? "",
            addressPart: origin.cacheAddressPart,
            geoPart: origin.cacheGeoPart,
            uiLang,
            popularityWindowDays,
            distancePolicyKey,
            rankingCriteriaKey: (rankingCriteria ?? []).join(","),
          }),
      scopePolicyRows,
    };

    await sharedGenerationSync;
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
          viewerUserId: deliveryOrigin.userId,
          scopeMeta,
        });
        bodyOut = await attachBrowseDiscoveryShelf(supabase, ctx, bodyOut, shelfInput);
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
      scopeMeta,
    });

    if (snap) {
      let bodyOut = snap.body as StoresBrowseResponseBody;
      if ("stores" in bodyOut) {
        try {
          bodyOut = await attachBrowseDiscoveryShelf(supabase, ctx, bodyOut, shelfInput);
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
        error: STORE_PUBLIC_API_ERROR_CODES.browse,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
