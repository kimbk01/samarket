import { haversineKm } from "@/lib/geo/haversine-km";
import { devLogRoutesSkipped } from "@/lib/geo/google-routes-client";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import {
  resolveStoreDiscoveryBrowseDisplayStatus,
  resolveStoreDiscoveryEligibility,
} from "@/lib/stores/store-discovery-eligibility";
import {
  resolveStoreBrowseSortedByMeta,
  sortStoreDiscoveryBrowseRows,
  type StoreBrowseServerSortId,
} from "@/lib/stores/store-discovery-browse-sort";
import {
  applyStoreDiscoveryExposureRotation,
  buildStoreDiscoveryBrowseExposureScope,
} from "@/lib/stores/store-discovery-exposure";
import type { StoreCompletedOrderCountLoadStatus } from "@/lib/stores/store-discovery-popular-store";
import type {
  StoreRatingConfidenceLoadStatus,
  StoreRatingConfidencePolicyAuthority,
} from "@/lib/stores/store-rating-confidence-policy";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import {
  parseCommerceExtrasFromHoursJson,
  readExplicitStorePrepTimeMinutes,
} from "@/lib/stores/store-commerce-extras";
import type {
  DeliveryDistancePolicy,
  DeliveryStoreDistanceOverrides,
  DeliveryRideTimeSource,
} from "@/lib/delivery/delivery-ops-settings";
import {
  evaluateDeliveryServiceability,
  resolveEffectiveStoreDistancePolicy,
} from "@/lib/delivery/evaluate-delivery-serviceability";
import { isSameDeliveryAddressForList } from "@/lib/stores/store-list-delivery-origin";
import type { BrowseRouteOrigin } from "@/lib/stores/browse-route-origin";
import { BROWSE_ORGANIC_REPRESENTATIVE_PRODUCTS_MAX } from "@/lib/stores/browse-organic-contract";
import {
  logBrowsePerfSteps,
  logBrowsePerfStepsV2,
  resolveBrowsePerfWorstStage,
} from "@/lib/stores/browse-perf-steps-log";
import { mapFirstStoreBannerImageByStoreId } from "@/lib/stores/pick-store-hero-banner-image";
import type { BrowseTaxonomySlice } from "@/lib/stores/stores-browse-taxonomy-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";

export type StoreBrowseRow = {
  id: string;
  store_name: string;
  slug: string;
  description: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  profile_image_url: string | null;
  is_open: boolean | null;
  point_commerce_blocked?: boolean | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  store_topic_id?: string | null;
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

export type ProductMini = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  thumbnail_url: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
};

export type BannerMini = {
  store_id: string;
  id: string;
  image_url: string;
  sort_order: number | null;
  is_active: boolean | null;
  start_at: string | null;
  end_at: string | null;
};

/**
 * CUT 3 — BROWSE representative-product data contract max (=4).
 * Selection owner: assembleStoresBrowseResponse (is_featured DESC → sort_order ASC).
 * Presentation may show fewer; do not invent a second client selector.
 */
export const BROWSE_FEATURED_ITEMS_MAX = BROWSE_ORGANIC_REPRESENTATIVE_PRODUCTS_MAX;

/** PostgREST 임베드가 객체 또는 단일행 배열로 올 수 있음 */
export function embedOne(v: RelOne | RelOne[] | null | undefined): RelOne | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export const BROWSE_STORE_LIMIT = 60;
export const BROWSE_STORE_FETCH_CAP = 120;

export function buildBrowseStoresOrFilter(
  categoryId: string,
  resolvedTopicId: string | null,
  wantsAllSubs: boolean,
  orphanOrParts: string[],
): string {
  const legacyByBusinessType =
    orphanOrParts.length > 0 ? `or(${orphanOrParts.join(",")})` : null;
  const linked =
    wantsAllSubs || !resolvedTopicId
      ? `store_category_id.eq.${categoryId}`
      : `and(store_category_id.eq.${categoryId},store_topic_id.eq.${resolvedTopicId})`;
  const parts = [linked];
  if (legacyByBusinessType) {
    if (!wantsAllSubs && resolvedTopicId) {
      parts.push(`and(store_category_id.eq.${categoryId},store_topic_id.is.null,${legacyByBusinessType})`);
    }
    parts.push(`and(store_category_id.is.null,${legacyByBusinessType})`);
  }
  return parts.join(",");
}

export function logBrowseRoutePerf(args: {
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
export function normalizeBizTypeSeparators(raw: string): string {
  return raw
    .trim()
    .replace(/\s*[\u00B7\u2219‧･]\s*/g, " · ")
    .replace(/\s*[-–—|]\s*/g, " · ");
}

/**
 * business_type 첫 토큰이 primary 슬러그 또는 DB 1차 표시명(예: 식당) 과 일치할 때 세부 파싱.
 * (신청 실패 시 `${slug} · ${sub}` 또는 `식당 · 한식` 등 혼재)
 */
export type BrowseSubFilterRow = {
  store_category_id?: string | null;
  store_topic_id?: string | null;
  business_type?: string | null;
};

export type BrowseSubFilterContext = {
  primary: string;
  subRaw: string;
  wantsAllSubs: boolean;
  /** CUT 3 — required for FK membership (store_categories.id). */
  categoryId: string | null;
  primaryAliases: string[];
  topicList: { slug: string; name: string }[];
  resolvedTopicId: string | null;
};

/** 2차 업종 표시명 → slug (legacy business_type 매칭용) */
export function buildBrowseTopicNameToSlugMap(
  topicList: { slug: string; name: string }[],
): Map<string, string> {
  const topicNameToSlug = new Map<string, string>();
  for (const t of topicList) {
    const nk = String(t.name).trim().toLowerCase();
    const sk = String(t.slug).trim().toLowerCase();
    if (nk && !topicNameToSlug.has(nk)) topicNameToSlug.set(nk, sk);
  }
  return topicNameToSlug;
}

export function browseOrphanMatchesChosenSub(
  parsed: { subSlugGuess: string; subLabelGuess: string } | null,
  opts: { wantsAllSubs: boolean; subRaw: string; topicNameToSlug: Map<string, string> },
): boolean {
  if (opts.wantsAllSubs) return true;
  if (!parsed) return false;
  const guessSlug = parsed.subSlugGuess.trim().toLowerCase();
  if (guessSlug === opts.subRaw) return true;
  const slugViaKoName = opts.topicNameToSlug.get(parsed.subLabelGuess.trim().toLowerCase());
  return slugViaKoName === opts.subRaw;
}

/**
 * CUT 3 CONTRACT — BROWSE category membership = taxonomy FKs only.
 * - primary (`wantsAllSubs`): `store_category_id === categoryId`
 * - secondary: `store_category_id === categoryId` AND `store_topic_id === resolvedTopicId`
 * DO NOT: business_type / name / slug inference (legacy helpers kept but not membership authority).
 */
export function browseStoreRowMatchesSubFilter(
  row: BrowseSubFilterRow,
  ctx: BrowseSubFilterContext,
  _topicNameToSlug?: Map<string, string>,
): boolean {
  const categoryId = String(ctx.categoryId ?? "").trim();
  if (!categoryId) return false;
  const rowCat = String(row.store_category_id ?? "").trim();
  if (!rowCat || rowCat !== categoryId) return false;

  if (ctx.wantsAllSubs) return true;

  const topicId = String(ctx.resolvedTopicId ?? "").trim();
  if (!topicId) return false;
  return String(row.store_topic_id ?? "").trim() === topicId;
}

export function parseBizTypePrimarySub(
  businessType: string | null | undefined,
  primarySlug: string,
  primaryDisplayNames: string[],
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
export function sanitizeForIlikeFragment(s: string): string {
  return s.replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "").trim();
}

/** browse 카드·정렬·commerce 스냅샷에 필요한 컬럼만 (description·배너·전체 products 제외) */
export const STORE_ROW_BROWSE_FIELDS = `
        id,
        store_category_id,
        store_topic_id,
        store_name,
        slug,
        region,
        city,
        district,
        profile_image_url,
        is_open,
        point_commerce_blocked,
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

export const BROWSE_STORE_ROW_SELECTED_COLUMNS =
  "id,store_category_id,store_topic_id,store_name,slug,region,city,district,profile_image_url,is_open,point_commerce_blocked,rating_avg,review_count,delivery_available,pickup_available,visit_available,reservation_available,is_featured,lat,lng,business_hours_json,business_type";

export function mapBrowseEmbedRows(raw: unknown[]): StoreBrowseRow[] {
  return (raw ?? []).map((row) => {
    const o = row as StoreBrowseRow & { store_topics?: RelOne | RelOne[] };
    return {
      ...o,
      business_type: o.business_type ?? null,
      store_topics: embedOne(o.store_topics),
    };
  });
}

export type StoresBrowseRequestContext = {
  primary: string;
  subRaw: string;
  wantsAllSubs: boolean;
  sub: string;
  district: string | null;
  regionQ: string;
  cityQ: string;
  uiLang: AppLanguageCode;
  origin: BrowseRouteOrigin;
  deliveryRideTimeSource: DeliveryRideTimeSource;
  deliveryDistancePolicy: DeliveryDistancePolicy;
  storeDistanceOverrides: DeliveryStoreDistanceOverrides;
  routeMetricsByStoreId?: Map<string, { rideMinutes: number | null; routeDistanceMeters: number | null }> | null;
  sort: StoreBrowseServerSortId;
  page: number;
  limit: number;
};

export type StoresBrowseDbBundle = {
  taxonomySlice: BrowseTaxonomySlice;
  storeRowsRaw: unknown[];
  products: ProductMini[];
  banners: BannerMini[];
  taxonomyCacheHit: boolean;
  baseQueryMs: number;
  categoryQueryMs: number;
  productPreviewQueryMs: number;
  distanceSortMs: number;
  queryCount: number;
};

export type StoresBrowseResponseBody = {
  ok: true;
  stores: BrowseStoreListItem[];
  meta: {
    source: "supabase";
    primary: string;
    sub: string;
    all_topics: boolean;
    sorted_by:
      | "eligibility_district_distance_orders_rating"
      | "eligibility_distance"
      | "eligibility_rating"
      | "eligibility_rating_confidence"
      | "eligibility_reviews"
      | "eligibility_popular"
      | "eligibility_prep";
    sort: StoreBrowseServerSortId;
    page: number;
    limit: number;
    origin_source: BrowseRouteOrigin["source"];
    origin_address_id: null;
    delivery_ride_time_source: DeliveryRideTimeSource;
    delivery_distance_policy: {
      enabled: boolean;
      source: DeliveryDistancePolicy["source"];
      default_max_km: number | null;
      over_distance_behavior: DeliveryDistancePolicy["overDistanceBehavior"];
    };
    /** CUT 8 — ranking authority that produced list order */
    ranking_authority?: "old" | "new";
    /** sort=rating Bayesian policy status */
    rating_confidence?: StoreRatingConfidenceLoadStatus;
    compositionEngine?: "live";
    browseInsertion?: {
      organicIds: string[];
      rows: unknown[];
      adCount: number;
      couponCount: number;
      sponsoredStoreIds: string[];
      surfaceAllowed: boolean;
      couponBadgeByStoreId?: Record<string, { title: string }>;
    };
    /** CATEGORY operator CMS — primary/secondary scope (menu-centric, not HOME shelves). */
    browseScopePolicy?: {
      primarySlug: string;
      subSlug: string | null;
      enabled: boolean;
      displayTitleKo: string | null;
      displayTitleEn: string | null;
      adEnabled: boolean;
      couponEnabled: boolean;
      cardType: "store" | "product" | "mixed";
      defaultSort?: import("@/lib/stores/store-discovery-browse-sort").StoreBrowseServerSortId;
    };
  };
};

export type StoresBrowseAssembleResult = {
  body: StoresBrowseResponseBody;
  transformMs: number;
  resultCount: number;
  dbBaseMs: number;
  dbRelatedMs: number;
};

function resolveStoreDistancePolicy(
  ctx: Pick<StoresBrowseRequestContext, "deliveryDistancePolicy" | "storeDistanceOverrides">,
  storeId: string
): { applies: boolean; maxKm: number | null } {
  const e = resolveEffectiveStoreDistancePolicy(
    ctx.deliveryDistancePolicy,
    ctx.storeDistanceOverrides,
    storeId
  );
  return { applies: e.applies, maxKm: e.maxKm };
}

function resolveDistanceForSort(
  ctx: StoresBrowseRequestContext,
  row: StoreBrowseRow
): { distanceKm: number | null; outOfRange: boolean; applies: boolean } {
  /** SERVICEABILITY display uses haversine only. Google route km is ETA/display enrichment, not eligibility. */
  const svc = evaluateDeliveryServiceability({
    policy: ctx.deliveryDistancePolicy,
    overrides: ctx.storeDistanceOverrides,
    storeId: row.id,
    customerLat: ctx.origin.lat,
    customerLng: ctx.origin.lng,
    storeLat: row.lat,
    storeLng: row.lng,
  });
  if (!svc.applies) {
    return { distanceKm: null, outOfRange: false, applies: false };
  }
  const routeMeters = ctx.routeMetricsByStoreId?.get(row.id)?.routeDistanceMeters ?? null;
  const routeKm =
    ctx.deliveryDistancePolicy.source === "google" &&
    routeMeters != null &&
    Number.isFinite(routeMeters) &&
    routeMeters >= 0
      ? routeMeters / 1000
      : null;
  const distanceKm = routeKm ?? svc.distanceKm;
  const outOfRange = svc.reason === "out_of_range" || svc.reason === "missing_store_coords";
  return { distanceKm, outOfRange, applies: true };
}

export type BrowseFilteredStoreRowsResult = {
  rows: StoreBrowseRow[];
  distById: Map<string, number | null> | null;
  statusById: Map<string, BrowseStoreListItem["status"]>;
  distanceSortMs: number;
  /** When set (NEW authority), display OOR uses projection/wave membership — not live recalculation. */
  outOfRangeById?: Map<string, boolean> | null;
  /** sort=rating Bayesian policy status (omitted for other sorts). */
  ratingConfidenceStatus?: StoreRatingConfidenceLoadStatus;
};

function resolveBrowseStoreRowStatus(
  row: StoreBrowseRow,
  distanceOutOfRange = false
): BrowseStoreListItem["status"] {
  return resolveStoreDiscoveryBrowseDisplayStatus({
    business_hours_json: row.business_hours_json,
    is_open: row.is_open,
    point_commerce_blocked: row.point_commerce_blocked,
    delivery_available: row.delivery_available,
    distanceOutOfRange,
  });
}

function buildBrowseStoreStatusMap(
  rows: StoreBrowseRow[],
  outOfRangeById: Map<string, boolean>
): Map<string, BrowseStoreListItem["status"]> {
  const statusById = new Map<string, BrowseStoreListItem["status"]>();
  for (const row of rows) {
    statusById.set(row.id, resolveBrowseStoreRowStatus(row, outOfRangeById.get(row.id) === true));
  }
  return statusById;
}

function buildBrowseEligibilityRankMap(
  rows: StoreBrowseRow[],
  outOfRangeById: Map<string, boolean>
): Map<string, number> {
  const rankById = new Map<string, number>();
  for (const row of rows) {
    const eligibility = resolveStoreDiscoveryEligibility({
      business_hours_json: row.business_hours_json,
      is_open: row.is_open,
      point_commerce_blocked: row.point_commerce_blocked,
      delivery_available: row.delivery_available,
      distanceOutOfRange: outOfRangeById.get(row.id) === true,
    });
    rankById.set(row.id, eligibility.rank);
  }
  return rankById;
}

/** RPC/legacy 후보에서 FK membership 으로 행만 추림 (정렬·거리 전) */
export function resolveBrowseFilteredStoreRows(
  ctx: Pick<StoresBrowseRequestContext, "primary" | "subRaw" | "wantsAllSubs">,
  taxonomySlice: BrowseTaxonomySlice,
  storeRowsRaw: unknown[],
): StoreBrowseRow[] {
  const filterCtx: BrowseSubFilterContext = {
    primary: ctx.primary,
    subRaw: ctx.subRaw,
    wantsAllSubs: ctx.wantsAllSubs,
    categoryId: taxonomySlice.categoryId ? String(taxonomySlice.categoryId) : null,
    primaryAliases: taxonomySlice.primaryAliases,
    topicList: taxonomySlice.topicList,
    resolvedTopicId: taxonomySlice.resolvedTopicId,
  };
  const topicNameToSlug = buildBrowseTopicNameToSlugMap(taxonomySlice.topicList);
  type StoreRowWithCat = StoreBrowseRow & { store_category_id?: string | null; store_topic_id?: string | null };
  const mapped = mapBrowseEmbedRows(storeRowsRaw ?? []) as StoreRowWithCat[];
  const rows: StoreBrowseRow[] = [];
  const seen = new Set<string>();
  for (const r of mapped) {
    if (!browseStoreRowMatchesSubFilter(r, filterCtx, topicNameToSlug)) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push(r);
  }
  return rows;
}

/**
 * CONTRACT — NEW discovery live path 도 OLD/SB1 과 동일 sub membership.
 * Wave RPC 가 null-topic 을 넓게 가져와도 assemble 전 이 함수로 재추림.
 * DO NOT: ranking_authority=new 에서 이 단계를 건너뛰기.
 */
export function applyBrowseSubFilterContractToPrefetchedFilter(
  ctx: Pick<StoresBrowseRequestContext, "primary" | "subRaw" | "wantsAllSubs">,
  taxonomySlice: BrowseTaxonomySlice,
  filter: BrowseFilteredStoreRowsResult,
): BrowseFilteredStoreRowsResult {
  const rows = resolveBrowseFilteredStoreRows(ctx, taxonomySlice, filter.rows);
  if (rows.length === filter.rows.length) {
    const sameOrder = rows.every((r, i) => r.id === filter.rows[i]?.id);
    if (sameOrder) return filter;
  }
  const keep = new Set(rows.map((r) => r.id));
  const trimMap = <T>(m: Map<string, T> | null | undefined): Map<string, T> | null | undefined => {
    if (m == null) return m;
    const next = new Map<string, T>();
    for (const [id, value] of m) {
      if (keep.has(id)) next.set(id, value);
    }
    return next;
  };
  return {
    rows,
    distById: trimMap(filter.distById) ?? null,
    statusById: trimMap(filter.statusById) ?? new Map(),
    distanceSortMs: filter.distanceSortMs,
    outOfRangeById: trimMap(filter.outOfRangeById),
    ratingConfidenceStatus: filter.ratingConfidenceStatus,
  };
}

/**
 * NEW ranking authority — sort=rating only.
 * Reuses existing Bayesian comparator + policy status; does not re-paginate or touch other sorts.
 */
export function applyNewAuthorityRatingConfidenceToBrowseFilter(
  ctx: Pick<StoresBrowseRequestContext, "district" | "sort" | "deliveryDistancePolicy" | "origin">,
  filter: BrowseFilteredStoreRowsResult,
  ratingConfidencePolicy: StoreRatingConfidencePolicyAuthority | null,
  ratingConfidenceStatus: StoreRatingConfidenceLoadStatus
): BrowseFilteredStoreRowsResult {
  if (ctx.sort !== "rating") return filter;

  const outOfRangeById = filter.outOfRangeById ?? new Map<string, boolean>();
  const eligibilityRankById = buildBrowseEligibilityRankMap(filter.rows, outOfRangeById);
  const hasGeo =
    ctx.deliveryDistancePolicy.enabled && ctx.origin.lat != null && ctx.origin.lng != null;

  const rows = sortStoreDiscoveryBrowseRows(filter.rows, {
    district: ctx.district,
    sort: "rating",
    eligibilityRankById,
    distanceKmById: hasGeo ? filter.distById : null,
    outOfRangeById: hasGeo ? outOfRangeById : null,
    hasGeo,
    ratingConfidencePolicy,
  });

  return {
    ...filter,
    rows,
    ratingConfidenceStatus,
  };
}

/**
 * CUT 3 — NEW wave path sort=fast.
 * Wave SQL has no prep minutes; after hydrate apply the same explicit-prep SSOT as OLD
 * (`readExplicitStorePrepTimeMinutes` / fastPrepCmp). No new metric.
 */
export function applyNewAuthorityFastPrepSortToBrowseFilter(
  ctx: Pick<StoresBrowseRequestContext, "district" | "sort" | "deliveryDistancePolicy" | "origin">,
  filter: BrowseFilteredStoreRowsResult
): BrowseFilteredStoreRowsResult {
  if (ctx.sort !== "fast") return filter;

  const outOfRangeById = filter.outOfRangeById ?? new Map<string, boolean>();
  const eligibilityRankById = buildBrowseEligibilityRankMap(filter.rows, outOfRangeById);
  const hasGeo =
    ctx.deliveryDistancePolicy.enabled && ctx.origin.lat != null && ctx.origin.lng != null;
  const explicitPrepMinutesById = new Map(
    filter.rows.map((r) => [r.id, readExplicitStorePrepTimeMinutes(r.business_hours_json)] as const)
  );

  const rows = sortStoreDiscoveryBrowseRows(filter.rows, {
    district: ctx.district,
    sort: "fast",
    eligibilityRankById,
    distanceKmById: hasGeo ? filter.distById : null,
    outOfRangeById: hasGeo ? outOfRangeById : null,
    hasGeo,
    explicitPrepMinutesById,
  });

  return {
    ...filter,
    rows,
  };
}

/** orphan·거리 정렬 후 목록 행 — legacy fetch 가 product/banner id 추출에 사용 */
export function resolveBrowseFilteredSortedStoreRows(
  ctx: StoresBrowseRequestContext,
  taxonomySlice: BrowseTaxonomySlice,
  storeRowsRaw: unknown[],
  prefilteredRows?: StoreBrowseRow[],
  completedOrderCount30dById?: Map<string, number> | null,
  completedOrderCountStatus?: StoreCompletedOrderCountLoadStatus,
  ratingConfidencePolicy?: StoreRatingConfidencePolicyAuthority | null,
  ratingConfidenceStatus?: StoreRatingConfidenceLoadStatus,
): BrowseFilteredStoreRowsResult {
  const { district, origin } = ctx;
  const userLat = origin.lat;
  const userLng = origin.lng;

  let rows: StoreBrowseRow[] =
    prefilteredRows ?? resolveBrowseFilteredStoreRows(ctx, taxonomySlice, storeRowsRaw);

  const distanceSort0 = devPerfNow();
  const distanceEnabled = ctx.deliveryDistancePolicy.enabled && userLat != null && userLng != null;
  const sort = ctx.sort;

  const outOfRangeById = new Map<string, boolean>();
  const distById = new Map<string, number | null>();
  for (const r of rows) {
    const d = resolveDistanceForSort(ctx, r);
    distById.set(r.id, d.distanceKm);
    outOfRangeById.set(r.id, d.outOfRange);
  }

  const statusById = buildBrowseStoreStatusMap(rows, outOfRangeById);
  const eligibilityRankById = buildBrowseEligibilityRankMap(rows, outOfRangeById);

  const needsOrderCounts = sort === "popular" || sort === "default";
  const orderStatus = completedOrderCountStatus ?? "ok";

  const explicitPrepMinutesById =
    sort === "fast"
      ? new Map(
          rows.map((r) => [r.id, readExplicitStorePrepTimeMinutes(r.business_hours_json)] as const)
        )
      : null;

  rows = sortStoreDiscoveryBrowseRows(rows, {
    district,
    sort,
    eligibilityRankById,
    distanceKmById: distanceEnabled ? distById : null,
    outOfRangeById: distanceEnabled ? outOfRangeById : null,
    hasGeo: distanceEnabled,
    completedOrderCount30dById: needsOrderCounts ? (completedOrderCount30dById ?? new Map()) : null,
    completedOrderCountStatus: needsOrderCounts ? orderStatus : "ok",
    explicitPrepMinutesById,
    ratingConfidencePolicy: sort === "rating" ? (ratingConfidencePolicy ?? null) : null,
  });

  if (sort === "default") {
    rows = applyStoreDiscoveryExposureRotation({
      recommendedSorted: rows,
      eligibilityRankById,
      exposureScope: buildStoreDiscoveryBrowseExposureScope({
        primary: ctx.primary,
        sub: ctx.sub,
        regionQ: ctx.regionQ,
        cityQ: ctx.cityQ,
        district: ctx.district,
        geoPart: ctx.origin.cacheGeoPart,
      }),
    });
  }

  const page = Math.max(1, Math.floor(ctx.page) || 1);
  const limit = Math.max(1, Math.min(BROWSE_STORE_FETCH_CAP, Math.floor(ctx.limit) || BROWSE_STORE_LIMIT));
  const pageStart = (page - 1) * limit;
  rows = rows.slice(pageStart, pageStart + limit);

  const distanceSortMs = devPerfNow() - distanceSort0;

  if (
    process.env.NODE_ENV === "development" &&
    ctx.deliveryDistancePolicy.source !== "google" &&
    userLat != null &&
    userLng != null &&
    rows.length > 0
  ) {
    devLogRoutesSkipped("list_screen_disabled", "api/stores/browse");
  }

  return {
    rows,
    distById: distanceEnabled ? distById : null,
    statusById,
    distanceSortMs,
    ratingConfidenceStatus: sort === "rating" ? ratingConfidenceStatus : undefined,
  };
}

export function assembleStoresBrowseResponse(
  ctx: StoresBrowseRequestContext,
  bundle: StoresBrowseDbBundle,
  prefetchedFilter?: BrowseFilteredStoreRowsResult,
): StoresBrowseAssembleResult {
  const {
    primary,
    subRaw,
    wantsAllSubs,
    sub,
    uiLang,
    origin,
    deliveryRideTimeSource,
    deliveryDistancePolicy,
  } = ctx;
  const userLat = origin.lat;
  const userLng = origin.lng;
  const { taxonomySlice, storeRowsRaw, products, banners, productPreviewQueryMs, distanceSortMs } = bundle;
  const primaryNameKoFallback = taxonomySlice.categoryName;
  const primaryAliases = taxonomySlice.primaryAliases;
  const selectedTopicMeta = taxonomySlice.selectedTopicMeta;

  const { rows, distById, statusById } =
    prefetchedFilter ?? resolveBrowseFilteredSortedStoreRows(ctx, taxonomySlice, storeRowsRaw);

  const featuredByStore = new Map<
    string,
    { productId: string; name: string; price: number; imageUrl: string | null }[]
  >();

  const heroBannerByStore = mapFirstStoreBannerImageByStoreId(
    banners.map((b) => ({
      store_id: String(b.store_id),
      id: String(b.id),
      image_url: String(b.image_url ?? ""),
      sort_order: b.sort_order,
      is_active: b.is_active === false ? false : undefined,
      start_at: b.start_at,
      end_at: b.end_at,
    })),
  );

  const grouped = new Map<string, ProductMini[]>();
  for (const p of products) {
    const arr = grouped.get(p.store_id) ?? [];
    arr.push(p);
    grouped.set(p.store_id, arr);
  }
  for (const [storeId, arr] of grouped) {
    const sorted = [...arr].sort((a, b) => {
      const f = Number(!!b.is_featured) - Number(!!a.is_featured);
      if (f !== 0) return f;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    featuredByStore.set(
      storeId,
      sorted.slice(0, BROWSE_FEATURED_ITEMS_MAX).map((x) => ({
        productId: String(x.id),
        name: x.title,
        price: Number(x.price),
        imageUrl: resolveBrowseFeaturedMenuImageUrl(x.thumbnail_url),
      })),
    );
  }

  const dbRelatedMs = productPreviewQueryMs;
  const dbBaseMs = bundle.categoryQueryMs + bundle.baseQueryMs + distanceSortMs;
  const transform0 = devPerfNow();

  const stores: BrowseStoreListItem[] = rows.map((r) => {
    const legacy =
      (r.business_type ?? "").trim().length > 0 ?
        parseBizTypePrimarySub(r.business_type, primary, primaryAliases)
      : null;
    /** 실제 매장 topic 우선 — 선택 칩 stamp 로 누수 소속을 위장하지 않음 */
    const top = wantsAllSubs ? r.store_topics : (r.store_topics ?? selectedTopicMeta);
    const rowPolicy = resolveStoreDistancePolicy(ctx, r.id);
    const rowDistance = resolveDistanceForSort(ctx, r);
    const distanceOutOfRange =
      prefetchedFilter?.outOfRangeById?.has(r.id) === true
        ? prefetchedFilter.outOfRangeById.get(r.id) === true
        : rowDistance.outOfRange;
    const status = statusById.get(r.id) ?? resolveBrowseStoreRowStatus(r, distanceOutOfRange);
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
    /** 목록: 관리자 정책 산식 — 기본은 직선, google 선택 시 matrix 성공분만 route 거리 */
    const routeMeters = ctx.routeMetricsByStoreId?.get(r.id)?.routeDistanceMeters ?? null;
    const routeDistanceKm =
      routeMeters != null && Number.isFinite(routeMeters) && routeMeters >= 0 ? routeMeters / 1000 : null;
    const displayDistanceKm = rowPolicy.applies ? (isSameAddress ? 0 : distanceKm) : null;
    const rideRaw = isSameAddress ? 0 : null;
    const rideMinutes = r.delivery_available ? rideRaw : null;
    const routeCtx = rowPolicy.applies && userLat != null && userLng != null;
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
      featuredItems: featuredByStore.get(r.id) ?? [],
      profileImageUrl: r.profile_image_url,
      heroBannerImageUrl: heroBannerByStore.get(r.id) ?? null,
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
      straightDistanceKm:
        rowPolicy.applies && userLat != null && userLng != null
          ? haversineKm(userLat, userLng, r.lat, r.lng)
          : null,
      routeDistanceKm:
        deliveryDistancePolicy.source === "google" && rowPolicy.applies ? routeDistanceKm : null,
      distancePolicyApplied: rowPolicy.applies,
      distanceOutOfRange,
      distanceSource: rowPolicy.applies ? deliveryDistancePolicy.source : null,
      maxDeliveryDistanceKm: rowPolicy.maxKm,
    };
  });

  const body: StoresBrowseResponseBody = {
    ok: true,
    stores,
    meta: {
      source: "supabase",
      primary,
      sub,
      all_topics: wantsAllSubs,
      sorted_by: resolveStoreBrowseSortedByMeta(
        ctx.sort,
        userLat != null && userLng != null,
        prefetchedFilter?.ratingConfidenceStatus === "active"
      ),
      sort: ctx.sort,
      rating_confidence: prefetchedFilter?.ratingConfidenceStatus,
      page: ctx.page,
      limit: ctx.limit,
      origin_source: origin.source,
      origin_address_id: null,
      delivery_ride_time_source: deliveryRideTimeSource,
      delivery_distance_policy: {
        enabled: deliveryDistancePolicy.enabled,
        source: deliveryDistancePolicy.source,
        default_max_km: deliveryDistancePolicy.defaultMaxKm,
        over_distance_behavior: deliveryDistancePolicy.overDistanceBehavior,
      },
    },
  };
  const transformMs = devPerfNow() - transform0;

  return {
    body,
    transformMs,
    resultCount: stores.length,
    dbBaseMs,
    dbRelatedMs,
  };
}
