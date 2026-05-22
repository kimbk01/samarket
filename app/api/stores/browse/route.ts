import { NextResponse } from "next/server";
import { districtRank, haversineKm } from "@/lib/geo/haversine-km";
import { devLogRoutesSkipped } from "@/lib/geo/google-routes-client";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import {
  loadDeliveryRideTimeSource,
  peekDeliveryRideTimeSource,
  type DeliveryRideTimeSource,
} from "@/lib/delivery/delivery-ops-settings";
import { isSameDeliveryAddressForList } from "@/lib/stores/store-list-delivery-origin";
import { resolveBrowseRouteOrigin } from "@/lib/stores/browse-route-origin";
import {
  logBrowsePerfSteps,
  logBrowsePerfStepsV2,
  resolveBrowsePerfWorstStage,
} from "@/lib/stores/browse-perf-steps-log";
import { loadBrowseTaxonomySlice } from "@/lib/stores/stores-browse-taxonomy-cache";
import {
  resolveRouteMemoryCacheBypass,
  type RouteCacheBypassReason,
} from "@/lib/http/route-cache-bypass";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import { browseListCacheKey, peekStoresBrowseCache, setStoresBrowseCache } from "@/lib/stores/stores-browse-response-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import { detectAcceptLanguageAppLanguage } from "@/lib/i18n/language-preference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_BROWSE_HTTP_CACHE_CONTROL = "private, no-store";

type StoreBrowseRow = {
  id: string;
  store_name: string;
  slug: string;
  description: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  profile_image_url: string | null;
  is_open: boolean | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  visit_available: boolean | null;
  reservation_available: boolean | null;
  is_featured: boolean | null;
  lat: number | null;
  lng: number | null;
  business_hours_json: unknown;
  /** taxonomy 미연결 시 `/api/me/stores` 가 `${primary} · ${sub}` 형태로 채움 */
  business_type: string | null;
  store_topics: { slug: string; name: string } | null;
};

type RelOne = { slug: string; name: string };

/** PostgREST 임베드가 객체 또는 단일행 배열로 올 수 있음 */
function embedOne(v: RelOne | RelOne[] | null | undefined): RelOne | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const BROWSE_STORE_LIMIT = 60;
const BROWSE_STORE_FETCH_CAP = 120;
function buildBrowseStoresOrFilter(
  categoryId: string,
  resolvedTopicId: string | null,
  wantsAllSubs: boolean,
  orphanOrParts: string[],
): string {
  const linked =
    wantsAllSubs || !resolvedTopicId ?
      `store_category_id.eq.${categoryId}`
    : `and(store_category_id.eq.${categoryId},store_topic_id.eq.${resolvedTopicId})`;
  if (orphanOrParts.length === 0) return linked;
  const orphan = `and(store_category_id.is.null,or(${orphanOrParts.join(",")}))`;
  return `${linked},${orphan}`;
}

function logBrowseRoutePerf(args: {
  tRoute0: number;
  cacheKey: string;
  cacheHit: 0 | 1;
  authMs: number;
  taxonomyCacheHit?: boolean;
  dbBaseMs: number;
  dbRelatedMs: number;
  transformMs: number;
  resultCount: number;
  v2?: {
    base_query_ms: number;
    category_query_ms: number;
    product_preview_query_ms: number;
    review_summary_query_ms: number;
    distance_sort_ms: number;
    query_count: number;
    selected_columns: string;
  };
}): void {
  const totalMs = Math.round(devPerfNow() - args.tRoute0);
  const dbTotalMs = args.dbBaseMs + args.dbRelatedMs;
  logRoutePerf({
    route: "/api/stores/browse",
    total_ms: totalMs,
    db_ms: args.cacheHit ? 0 : Math.round(dbTotalMs),
    cache_hit: args.cacheHit,
    auth_ms: Math.round(args.authMs),
    serialize_ms: 0,
  });
  logBrowsePerfSteps({
    cache_key: args.cacheKey,
    cache_hit: args.cacheHit,
    auth_required: false,
    auth_ms: Math.round(args.authMs),
    taxonomy_cache_hit: args.cacheHit === 1 ? false : (args.taxonomyCacheHit ?? false),
    db_base_ms: Math.round(args.dbBaseMs),
    db_related_ms: Math.round(args.dbRelatedMs),
    db_total_ms: Math.round(dbTotalMs),
    transform_ms: Math.round(args.transformMs),
    total_ms: totalMs,
    result_count: args.resultCount,
  });
  const v2 = args.v2;
  if (!v2) return;
  const stages = {
    base_query: v2.base_query_ms,
    category_query: v2.category_query_ms,
    product_preview: v2.product_preview_query_ms,
    distance_sort: v2.distance_sort_ms,
    transform: args.transformMs,
  };
  const { worst_stage, worst_stage_ms } = resolveBrowsePerfWorstStage(stages);
  logBrowsePerfStepsV2({
    request_key: args.cacheKey,
    cache_hit: args.cacheHit,
    taxonomy_cache_hit: args.taxonomyCacheHit ?? false,
    db_base_ms: Math.round(args.dbBaseMs),
    db_related_ms: Math.round(args.dbRelatedMs),
    base_query_ms: Math.round(v2.base_query_ms),
    category_query_ms: Math.round(v2.category_query_ms),
    product_preview_query_ms: Math.round(v2.product_preview_query_ms),
    review_summary_query_ms: Math.round(v2.review_summary_query_ms),
    distance_sort_ms: Math.round(v2.distance_sort_ms),
    transform_ms: Math.round(args.transformMs),
    query_count: v2.query_count,
    result_count: args.resultCount,
    selected_columns: v2.selected_columns,
    worst_stage,
    worst_stage_ms,
  });
}

/** · / - / | 등 업종 구분 표기 통일 */
function normalizeBizTypeSeparators(raw: string): string {
  return raw
    .trim()
    .replace(/\s*[\u00B7\u2219‧･]\s*/g, " · ")
    .replace(/\s*[-–—|]\s*/g, " · ");
}

/**
 * business_type 첫 토큰이 primary 슬러그 또는 DB 1차 표시명(예: 식당) 과 일치할 때 세부 파싱.
 * (신청 실패 시 `${slug} · ${sub}` 또는 `식당 · 한식` 등 혼재)
 */
function parseBizTypePrimarySub(
  businessType: string | null | undefined,
  primarySlug: string,
  primaryDisplayNames: string[]
): { subSlugGuess: string; subLabelGuess: string } | null {
  const bt = normalizeBizTypeSeparators(businessType ?? "");
  if (!bt) return null;
  const parts = bt.split(" · ").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const headNorm = parts[0].toLowerCase();
  const aliases = new Set(primaryDisplayNames.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!aliases.has(headNorm)) return null;
  const label = parts.slice(1).join(" · ").trim();
  if (!label) return null;
  return { subSlugGuess: label.toLowerCase(), subLabelGuess: label };
}

/** ILIKE 패턴용 — 와일드카드 문자 제거 */
function sanitizeForIlikeFragment(s: string): string {
  return s.replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "").trim();
}

/** browse 카드·정렬·commerce 스냅샷에 필요한 컬럼만 (description·배너·전체 products 제외) */
const STORE_ROW_BROWSE_FIELDS = `
        id,
        store_category_id,
        store_name,
        slug,
        region,
        city,
        district,
        profile_image_url,
        is_open,
        rating_avg,
        review_count,
        delivery_available,
        pickup_available,
        visit_available,
        reservation_available,
        is_featured,
        lat,
        lng,
        business_hours_json,
        business_type`;

const BROWSE_STORE_ROW_SELECTED_COLUMNS =
  "id,store_category_id,store_name,slug,region,city,district,profile_image_url,is_open,rating_avg,review_count,delivery_available,pickup_available,visit_available,reservation_available,is_featured,lat,lng,business_hours_json,business_type";

function mapBrowseEmbedRows(raw: unknown[]): StoreBrowseRow[] {
  return (raw ?? []).map((row) => {
    const o = row as StoreBrowseRow & { store_topics?: RelOne | RelOne[] };
    return {
      ...o,
      business_type: o.business_type ?? null,
      store_topics: embedOne(o.store_topics),
    };
  });
}

/**
 * 업종(primary slug) + 세부 주제(sub slug)별 실매장 목록 (서비스 롤, RLS 우회)
 * ?district= — 같은 구/동 우선 정렬(districtRank)
 * ?user_lat= & ?user_lng= — 거리 보조 정렬
 */
function browseJsonHeaders(opts: {
  tRoute0: number;
  cache_hit: 0 | 1;
  db_execution_ms: number;
  query_count: number;
  bypass: boolean;
  bypass_reason: RouteCacheBypassReason | null;
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
  };
}

export async function GET(req: Request) {
  const tRoute0 = devPerfNow();
  const uiLang = detectAcceptLanguageAppLanguage(req.headers.get("accept-language"));
  const { searchParams } = new URL(req.url);
  const cacheBypass = resolveRouteMemoryCacheBypass(searchParams);
  const primary = (searchParams.get("primary") ?? "").trim().toLowerCase();
  const subRaw = (searchParams.get("sub") ?? "").trim().toLowerCase();
  /** 세부 주제 미선택·「전체」 — 해당 1차 업종만 필터 (세부는 제한하지 않음). 예약 slug: `all` */
  const wantsAllSubs = subRaw === "" || subRaw === "all";
  const sub = wantsAllSubs ? "all" : subRaw;
  const district = searchParams.get("district")?.trim() || null;
  const regionQ = (searchParams.get("region") ?? "").trim();
  const cityQ = (searchParams.get("city") ?? "").trim();
  const pageQ = (searchParams.get("page") ?? "1").trim() || "1";
  const limitQ = (searchParams.get("limit") ?? String(BROWSE_STORE_LIMIT)).trim() || String(BROWSE_STORE_LIMIT);
  const origin = resolveBrowseRouteOrigin(searchParams);
  const userLat = origin.lat;
  const userLng = origin.lng;

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

  const cachedBrowse = cacheBypass.bypass ? null : peekStoresBrowseCache(browseCacheKey);
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
    return NextResponse.json(
      cachedBrowse,
      {
        headers: browseJsonHeaders({
          tRoute0,
          cache_hit: 1,
          db_execution_ms: 0,
          query_count: 0,
          bypass: cacheBypass.bypass,
          bypass_reason: cacheBypass.reason,
        }),
      }
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
    const ridePeek = peekDeliveryRideTimeSource();
    /** 목록 cold — admin_settings await 생략(peek miss 시 `store`). 다음 요청에서 TTL 히트. */
    const deliveryRideTimeSource: DeliveryRideTimeSource = ridePeek ?? "store";
    if (ridePeek == null) {
      void loadDeliveryRideTimeSource(supabase).catch(() => {});
    }
    let queryCount = 0;
    const dbBase0 = devPerfNow();
    let taxonomyCacheHit = false;
    let categoryQueryMs = 0;
    let taxonomySlice;
    try {
      const tax0 = devPerfNow();
      const tax = await loadBrowseTaxonomySlice(supabase, primary, subRaw, wantsAllSubs);
      categoryQueryMs = devPerfNow() - tax0;
      taxonomySlice = tax.slice;
      taxonomyCacheHit = tax.cacheHit;
      if (!taxonomyCacheHit) queryCount += 1;
    } catch (taxErr) {
      console.error("[api/stores/browse] taxonomy", taxErr);
      return NextResponse.json(
        { ok: false, stores: [], error: taxErr instanceof Error ? taxErr.message : "taxonomy_error" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (taxonomySlice.unknownPrimary) {
      const dbBaseMsEarly = devPerfNow() - dbBase0;
      logBrowseRoutePerf({
        tRoute0,
        cacheKey: browseCacheKey,
        cacheHit: 0,
        authMs: 0,
        taxonomyCacheHit,
        dbBaseMs: dbBaseMsEarly,
        dbRelatedMs: 0,
        transformMs: 0,
        resultCount: 0,
      });
      return NextResponse.json(
        {
          ok: true,
          stores: [],
          meta: {
            source: "supabase" as const,
            primary,
            sub,
            all_topics: wantsAllSubs,
            reason: "unknown_primary_slug",
          },
        },
        { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } },
      );
    }

    if (taxonomySlice.unknownTopic) {
      const dbBaseMsEarly = devPerfNow() - dbBase0;
      logBrowseRoutePerf({
        tRoute0,
        cacheKey: browseCacheKey,
        cacheHit: 0,
        authMs: 0,
        taxonomyCacheHit,
        dbBaseMs: dbBaseMsEarly,
        dbRelatedMs: 0,
        transformMs: 0,
        resultCount: 0,
      });
      return NextResponse.json(
        {
          ok: true,
          stores: [],
          meta: {
            source: "supabase" as const,
            primary,
            sub,
            all_topics: false,
            reason: "unknown_topic_slug",
          },
        },
        { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } },
      );
    }

    const primaryNameKoFallback = taxonomySlice.categoryName;
    const primaryAliases = taxonomySlice.primaryAliases;
    const topicList = taxonomySlice.topicList;
    const resolvedTopicId = taxonomySlice.resolvedTopicId;
    const selectedTopicMeta = taxonomySlice.selectedTopicMeta;
    const categoryId = taxonomySlice.categoryId;

    const primarySafe = sanitizeForIlikeFragment(primary);
    const cn = sanitizeForIlikeFragment(taxonomySlice.categoryName);
    const orphanOrParts: string[] = [];
    if (primarySafe.length >= 1) {
      orphanOrParts.push(
        `business_type.ilike.%${primarySafe} ·%`,
        `business_type.ilike.%${primarySafe}·%`,
        `business_type.ilike.%${primarySafe} -%`,
        `business_type.ilike.%${primarySafe}-%`,
      );
    }
    if (cn.length >= 1) {
      orphanOrParts.push(
        `business_type.ilike.%${cn} ·%`,
        `business_type.ilike.%${cn}·%`,
        `business_type.ilike.%${cn} -%`,
        `business_type.ilike.%${cn}-%`,
      );
    }

    const storeSelect =
      wantsAllSubs ?
        `${STORE_ROW_BROWSE_FIELDS}, store_topics ( slug, name )`
      : STORE_ROW_BROWSE_FIELDS;

    const storesOr = buildBrowseStoresOrFilter(categoryId, resolvedTopicId, wantsAllSubs, orphanOrParts);

    const baseQuery0 = devPerfNow();
    const { data: storeRowsRaw, error: storesErr } = await supabase
      .from("stores")
      .select(storeSelect)
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .or(storesOr)
      .limit(BROWSE_STORE_FETCH_CAP);
    const baseQueryMs = devPerfNow() - baseQuery0;
    queryCount += 1;

    if (storesErr) {
      console.error("[api/stores/browse] stores", storesErr);
      return NextResponse.json(
        { ok: false, stores: [], error: storesErr.message },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const topicNameToSlug = new Map<string, string>();
    for (const t of topicList) {
      const nk = String(t.name).trim().toLowerCase();
      const sk = String(t.slug).trim().toLowerCase();
      if (nk && !topicNameToSlug.has(nk)) topicNameToSlug.set(nk, sk);
    }

    function orphanMatchesChosenSub(parsed: { subSlugGuess: string; subLabelGuess: string } | null): boolean {
      if (wantsAllSubs) return true;
      if (!parsed) return false;
      const guessSlug = parsed.subSlugGuess.trim().toLowerCase();
      if (guessSlug === subRaw) return true;
      const slugViaKoName = topicNameToSlug.get(parsed.subLabelGuess.trim().toLowerCase());
      return slugViaKoName === subRaw;
    }

    type StoreRowWithCat = StoreBrowseRow & { store_category_id?: string | null };
    const mapped = mapBrowseEmbedRows(storeRowsRaw ?? []) as StoreRowWithCat[];
    const linked: StoreBrowseRow[] = [];
    const seen = new Set<string>();
    for (const r of mapped) {
      if (r.store_category_id) {
        linked.push(r);
        seen.add(r.id);
      }
    }
    let rows: StoreBrowseRow[] = linked;
    for (const o of mapped) {
      if (o.store_category_id) continue;
      if (seen.has(o.id)) continue;
      const legacy = parseBizTypePrimarySub(o.business_type, primary, primaryAliases);
      if (!orphanMatchesChosenSub(legacy)) continue;
      seen.add(o.id);
      rows.push(o);
    }

    const distanceSort0 = devPerfNow();
    const stableSlug = (a: StoreBrowseRow, b: StoreBrowseRow) =>
      String(a.slug ?? "").localeCompare(String(b.slug ?? ""));

    const stableId = (a: StoreBrowseRow, b: StoreBrowseRow) => String(a.id).localeCompare(String(b.id));

    const byDistrictFeaturedRating = (a: StoreBrowseRow, b: StoreBrowseRow) => {
      const dr = districtRank(a.district, district) - districtRank(b.district, district);
      if (dr !== 0) return dr;
      const feat = Number(!!b.is_featured) - Number(!!a.is_featured);
      if (feat !== 0) return feat;
      const ratingB = Number(b.rating_avg ?? 0);
      const ratingA = Number(a.rating_avg ?? 0);
      if (ratingB !== ratingA) return ratingB - ratingA;
      const rev = (b.review_count ?? 0) - (a.review_count ?? 0);
      if (rev !== 0) return rev;
      const slugCmp = stableSlug(a, b);
      if (slugCmp !== 0) return slugCmp;
      return stableId(a, b);
    };

    let distById: Map<string, number | null> | null = null;
    if (userLat != null && userLng != null) {
      const distMap = new Map<string, number | null>();
      for (const r of rows) {
        distMap.set(r.id, haversineKm(userLat, userLng, r.lat, r.lng));
      }
      distById = distMap;
      rows = [...rows].sort((a, b) => {
        const dr = districtRank(a.district, district) - districtRank(b.district, district);
        if (dr !== 0) return dr;
        const feat = Number(!!b.is_featured) - Number(!!a.is_featured);
        if (feat !== 0) return feat;
        const da = distMap.get(a.id) ?? null;
        const db = distMap.get(b.id) ?? null;
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return byDistrictFeaturedRating(a, b);
      });
    } else {
      rows = [...rows].sort(byDistrictFeaturedRating);
    }

    rows = rows.slice(0, BROWSE_STORE_LIMIT);
    const distanceSortMs = devPerfNow() - distanceSort0;
    const dbBaseMs = devPerfNow() - dbBase0;

    if (process.env.NODE_ENV === "development" && userLat != null && userLng != null && rows.length > 0) {
      devLogRoutesSkipped("list_screen_disabled", "api/stores/browse");
    }

    /**
     * cold 1회차 — `featuredItems: []` 고정. 메뉴 미리보기는
     * `GET /api/stores/browse-featured-items` deferred hydrate 전용 (query_count·db_related 0 유지).
     */
    const productPreviewQueryMs = 0;
    const dbRelated0 = devPerfNow();
    const dbRelatedMs = devPerfNow() - dbRelated0;
    const transform0 = devPerfNow();

    const stores: BrowseStoreListItem[] = rows.map((r) => {
      const top = wantsAllSubs ? r.store_topics : selectedTopicMeta;
      const legacy =
        (r.business_type ?? "").trim().length > 0 ?
          parseBizTypePrimarySub(r.business_type, primary, primaryAliases)
        : null;
      const openNow = resolveStoreFrontOpen(r.business_hours_json, r.is_open);
      const status: BrowseStoreListItem["status"] = openNow ? "open" : "preparing";
      const regionLabel = formatStoreLocationLine(r) ?? "위치 미등록";
      const extras = parseCommerceExtrasFromHoursJson(r.business_hours_json);
      const commerce = buildBrowseStoreCommerceSnapshot(r.business_hours_json);

      let distanceKm: number | null = null;
      if (distById) {
        distanceKm = distById.get(r.id) ?? null;
      }

      const isSameAddress = isSameDeliveryAddressForList(
        {
          source: origin.source,
          userId: null,
          addressId: null,
          placeId: null,
          lat: origin.lat,
          lng: origin.lng,
          addressIdentity: null,
          cacheKeyPart: origin.cacheGeoPart,
        },
        r,
      );
      /** 목록: 직선거리만 — `routeDistanceKm` 필드 미포함 */
      const displayDistanceKm = isSameAddress ? 0 : distanceKm;
      const rideRaw = isSameAddress ? 0 : null;
      const rideMinutes = r.delivery_available ? rideRaw : null;
      const routeCtx = userLat != null && userLng != null;
      const rowLabels = formatBrowseStoreRowLabels(uiLang, commerce, {
        deliveryAvailable: !!r.delivery_available,
        rideMinutes,
        routeContextPresent: routeCtx,
        deliveryRideTimeSource,
      });

      return {
        id: r.id,
        slug: r.slug,
        nameKo: r.store_name,
        tagline: null,
        primarySlug: primary,
        subSlug: wantsAllSubs ? "all" : (top?.slug ?? legacy?.subSlugGuess ?? subRaw),
        primaryNameKo: primaryNameKoFallback,
        subNameKo:
          wantsAllSubs ? "전체"
          : (top?.name ?? legacy?.subLabelGuess ?? subRaw),
        regionLabel,
        status,
        rating: r.rating_avg != null ? Number(r.rating_avg) : 0,
        reviewCount: r.review_count ?? 0,
        deliveryAvailable: !!r.delivery_available,
        pickupAvailable: r.pickup_available !== false,
        visitAvailable: r.visit_available !== false,
        reservationAvailable: r.reservation_available !== false,
        featuredItems: [],
        profileImageUrl: r.profile_image_url,
        heroBannerImageUrl: null,
        isFeatured: !!r.is_featured,
        estPrepLabel: extras.estPrepLabel,
        prepMinutes: extras.prepMinutes,
        rideMinutes,
        etaLabel: rowLabels.etaLabel,
        deliveryFeeLabel: rowLabels.deliveryFeeLabel,
        deliveryFeeStrikePhp: rowLabels.deliveryFeeStrikePhp,
        paymentMethodsLine: rowLabels.paymentMethodsLine,
        minOrderLabel: rowLabels.minOrderLabel,
        commerce,
        distanceKm: displayDistanceKm,
        straightDistanceKm: distanceKm,
      };
    });

    const responseBody = {
      ok: true as const,
      stores,
      meta: {
        source: "supabase" as const,
        primary,
        sub,
        all_topics: wantsAllSubs,
        sorted_by:
          userLat != null && userLng != null
            ? "district_featured_distance_rating"
            : "district_featured_rating",
        origin_source: origin.source,
        origin_address_id: null,
        delivery_ride_time_source: deliveryRideTimeSource,
      },
    };
    const transformMs = devPerfNow() - transform0;
    setStoresBrowseCache(browseCacheKey, responseBody);
    logBrowseRoutePerf({
      tRoute0,
      cacheKey: browseCacheKey,
      cacheHit: 0,
      authMs: 0,
      taxonomyCacheHit,
      dbBaseMs,
      dbRelatedMs,
      transformMs,
      resultCount: stores.length,
      v2: {
        base_query_ms: baseQueryMs,
        category_query_ms: categoryQueryMs,
        product_preview_query_ms: productPreviewQueryMs,
        review_summary_query_ms: 0,
        distance_sort_ms: distanceSortMs,
        query_count: queryCount,
        selected_columns: BROWSE_STORE_ROW_SELECTED_COLUMNS,
      },
    });
    return NextResponse.json(
      responseBody,
      {
        headers: browseJsonHeaders({
          tRoute0,
          cache_hit: 0,
          db_execution_ms: Math.round(dbBaseMs + dbRelatedMs),
          query_count: queryCount,
          bypass: cacheBypass.bypass,
          bypass_reason: cacheBypass.reason,
        }),
      }
    );
  } catch (e) {
    console.error("[api/stores/browse]", e);
    return NextResponse.json(
      {
        ok: false,
        stores: [],
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
