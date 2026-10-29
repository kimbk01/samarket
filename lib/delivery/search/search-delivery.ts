import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  evaluateStoreDeliveryServiceability,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { loadStoreServiceAreaRuntimeMap } from "@/lib/delivery/service-area/load-store-service-area-runtime-map";
import { DELIVERY_SERVICE_AREA_AUTHORITY } from "@/lib/delivery/service-area/authority";
import {
  resolveListDistanceOutOfRange,
  shouldExcludeOutOfRangeFromNormalList,
  type DeliveryListOriginSource,
} from "@/lib/delivery/delivery-list-oor-policy";
import type { DeliveryServiceabilityResult } from "@/lib/delivery/evaluate-delivery-serviceability";
import type { StoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { resolveDeliveryViewerGate, type DeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadStoresSearchTopBannerSlide,
  type SearchTopBannerSlide,
} from "@/lib/stores/load-store-search-top-banners";
import { isSampleStoreKind } from "@/lib/stores/store-public-menu-open";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import {
  matchDeliveryMenuGlobalSearch,
  matchDeliveryStoreGlobalSearch,
} from "@/lib/search/global/semantics/domain-fields";

function sanitizeForIlike(raw: string): string {
  return raw
    .trim()
    .slice(0, 60)
    .replace(/[%_,]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDeliveryKeyword(raw: string): { keyword: string; normalized: string } | null {
  const keyword = sanitizeForIlike(raw);
  if (!keyword || !isSearchableGlobalQuery(keyword)) return null;
  return { keyword, normalized: keyword.toLowerCase() };
}

export type DeliverySearchStoreResult = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  profile_image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  district: string | null;
  city: string | null;
  region: string | null;
  lat?: number | null;
  lng?: number | null;
  delivery_radius_km?: number | null;
  distanceKm?: number | null;
  distanceOutOfRange?: boolean;
  maxDeliveryDistanceKm?: number | null;
  distancePolicyApplied?: boolean;
  /** 묶음3-A S-03 — 샘플 매장(실제 주문 불가) 배지 */
  isSampleStore?: boolean;
};

export type DeliverySearchMenuResult = {
  id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
  /** 묶음3-A S-03 — 부모 매장이 샘플(실제 주문 불가) */
  isSampleStore?: boolean;
};

export type DeliverySearchDebug = {
  keyword: string;
  storeTable: "stores";
  menuTable: "store_products";
  storeConditions: string[];
  menuConditions: string[];
  matchedStoresCount: number;
  rawMatchedProductsCount: number;
  deliveryStoreIdsCount: number;
  finalMenusCount: number;
};

type StoreRow = DeliverySearchStoreResult & {
  approval_status?: string | null;
  is_visible?: boolean | null;
  delivery_available?: boolean | null;
};

/**
 * DSC-03 — 회원 배달 가능 지역(OOR) 제외는 조회 뒤 TS 에서 판정하므로, LIMIT 을 먼저 걸면 지역 안 매칭이
 * 잘려 나간다. 후보는 이 상한까지 넓게 읽고 **노출 판정 후** storeLimit/menuLimit 으로 자른다(최대 반환 수 불변).
 */
export const DELIVERY_SEARCH_STORE_FETCH_CAP = 100;

/** 키워드 매칭 대상 필드 — 매장은 이름·소개만(지역 필드 매칭 금지), 메뉴는 제목·요약만. */
export const DELIVERY_SEARCH_KEYWORD_FIELDS = {
  stores: { ilike_any: ["store_name", "description"] },
  menus: { ilike_any: ["title", "summary"] },
} as const;
export const DELIVERY_SEARCH_MENU_FETCH_CAP = 150;

/** v4 PL-01 — 실매장 = `delivery_available=true`, 샘플 = 배달 조건 면제 (PostgREST or, 다른 or 와 AND) */
export const DELIVERY_SEARCH_STORE_DELIVERY_OR = "delivery_available.eq.true,store_kind.eq.sample";

const DELIVERY_SEARCH_PRODUCT_SELECT =
  "id, store_id, title, summary, price, discount_price, thumbnail_url, item_type, admin_review_status, is_featured, sort_order, created_at, store_menu_sections ( is_hidden )";

export type DeliverySearchProductRow = ProductRow;
type ProductRow = {
  id: string;
  store_id: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
  product_status?: string | null;
  local_delivery_available?: boolean | null;
  item_type?: string | null;
  admin_review_status?: string | null;
  is_featured?: boolean | null;
  sort_order?: number | null;
  created_at?: string | null;
  store_menu_sections?: unknown;
};

function compareDeliverySearchProductRows(a: ProductRow, b: ProductRow): number {
  const f = Number(b.is_featured === true) - Number(a.is_featured === true);
  if (f !== 0) return f;
  const so = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
  if (so !== 0) return so;
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  return (Number.isFinite(cb) ? cb : 0) - (Number.isFinite(ca) ? ca : 0);
}

/**
 * v4 PL-01 — 실매장 메뉴(배달 가능 조건) + 샘플 매장 메뉴(배달 조건 면제)를 id 중복 없이 합치고,
 * 단일 쿼리와 같은 정렬(is_featured DESC → sort_order ASC → created_at DESC)로 재정렬한다.
 * 각 쿼리 상한은 `DELIVERY_SEARCH_MENU_FETCH_CAP` (DSC-03 — 지역 판정 전 자르지 않음, 최종 반환 수는 menuLimit).
 */
export function mergeDeliverySearchProductRows(
  primary: readonly ProductRow[],
  sample: readonly ProductRow[]
): ProductRow[] {
  const byId = new Map<string, ProductRow>();
  for (const row of [...primary, ...sample]) {
    const id = String(row?.id ?? "");
    if (!id || byId.has(id)) continue;
    const { stores: _embed, ...rest } = row as ProductRow & { stores?: unknown };
    void _embed;
    byId.set(id, rest as ProductRow);
  }
  return [...byId.values()].sort(compareDeliverySearchProductRows);
}

/**
 * Parent-store delivery eligibility for Global Search.
 * Distinct from STORE RESULT VISIBILITY (keyword hits remaining after OOR filter).
 * Menu gating must use this map, never leftover storeMetaById from remaining store hits.
 */
export type DeliverySearchStoreEligibility = {
  excludeFromMemberList: boolean;
  distanceOutOfRange: boolean;
  distanceKm: number | null;
  maxDeliveryDistanceKm: number | null;
  distancePolicyApplied: boolean;
};

export function unionDeliverySearchServiceAreaStoreIds(
  keywordStoreIds: readonly string[],
  menuParentStoreIds: readonly string[]
): string[] {
  return Array.from(
    new Set(
      [...keywordStoreIds, ...menuParentStoreIds]
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );
}

export function resolveDeliverySearchStoreEligibility(args: {
  originSource: DeliveryListOriginSource;
  svc: DeliveryServiceabilityResult;
}): DeliverySearchStoreEligibility {
  const distanceOutOfRange = resolveListDistanceOutOfRange({
    originSource: args.originSource,
    serviceabilityApplies: args.svc.applies,
    reason: args.svc.reason,
  });
  return {
    excludeFromMemberList: shouldExcludeOutOfRangeFromNormalList({
      originSource: args.originSource,
      distanceOutOfRange,
    }),
    distanceOutOfRange,
    distanceKm: args.svc.distanceKm,
    maxDeliveryDistanceKm: args.svc.applies ? args.svc.maxKm : null,
    distancePolicyApplied: args.svc.applies,
  };
}

/** Keyword store section: Member OOR stores are removed from the API payload. Guest discovery preserved. */
export function isDeliverySearchStoreVisible(args: {
  originSource: DeliveryListOriginSource;
  eligibility: DeliverySearchStoreEligibility | undefined;
}): boolean {
  if (args.originSource !== "saved_address") return true;
  if (!args.eligibility) return false;
  return args.eligibility.excludeFromMemberList !== true;
}

/**
 * Menu section: keyword match AND parent-store delivery eligibility.
 * Parent need not appear in the keyword Store section (menu-only match).
 * Member: fail-closed when parent eligibility was not evaluated.
 * Guest (`none`): do not apply Member OOR exclusion.
 */
export function isDeliverySearchMenuVisible(args: {
  originSource: DeliveryListOriginSource;
  parentStoreMetaExists: boolean;
  parentEligibility: DeliverySearchStoreEligibility | undefined;
}): boolean {
  if (!args.parentStoreMetaExists) return false;
  if (args.originSource !== "saved_address") return true;
  if (!args.parentEligibility) return false;
  return args.parentEligibility.excludeFromMemberList !== true;
}

export async function searchDeliveryDomain(input: {
  q: string;
  storeLimit?: number;
  menuLimit?: number;
  /**
   * S-09 — 목록(홈 피드·업종)과 같은 `resolveStoreListDeliveryOrigin` 결과.
   * 주소 출처·회원 LGU·열람 게이트를 목록과 같은 입력으로 판정한다 (검색 전용 주소 조회 없음).
   */
  origin: Pick<StoreListDeliveryOrigin, "source" | "userId" | "lat" | "lng" | "canonicalLguId">;
}): Promise<{
  ok: true;
  stores: DeliverySearchStoreResult[];
  menus: DeliverySearchMenuResult[];
  result_count: number;
  /** S-07·S-08 — 배달 열람 게이트 (`resolveDeliveryViewerGate`) */
  meta: { viewer_gate: DeliveryViewerGate };
  /** CUT J — presentation-only; null when none / failure (organic unchanged). */
  searchTopBanner?: SearchTopBannerSlide | null;
  debug?: DeliverySearchDebug;
}> {
  const viewerGate = resolveDeliveryViewerGate(input.origin);
  const meta = { viewer_gate: viewerGate };
  if (viewerGate !== "ok") {
    return { ok: true, stores: [], menus: [], result_count: 0, meta };
  }
  const parsed = normalizeDeliveryKeyword(input.q);
  if (!parsed) {
    return {
      ok: true,
      stores: [],
      menus: [],
      result_count: 0,
      meta,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              keyword: "",
              storeTable: "stores",
              menuTable: "store_products",
              storeConditions: ["approval_status=approved", "is_visible=true", "delivery_available=true OR store_kind=sample"],
              menuConditions: ["product_status=active", "local_delivery_available=true OR parent store_kind=sample"],
              matchedStoresCount: 0,
              rawMatchedProductsCount: 0,
              deliveryStoreIdsCount: 0,
              finalMenusCount: 0,
            }
          : undefined,
    };
  }

  const storeLimit = Math.max(1, Math.min(20, Math.floor(Number(input.storeLimit ?? 10)) || 10));
  const menuLimit = Math.max(1, Math.min(40, Math.floor(Number(input.menuLimit ?? 20)) || 20));

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return { ok: true, stores: [], menus: [], result_count: 0, meta };
  }

  const pat = `%${parsed.keyword}%`;
  const keyword = parsed.keyword;
  const storesQuery = sb
    .from("stores")
    .select(
      [
        "id",
        "slug",
        "store_name",
        "description",
        "profile_image_url",
        "rating_avg",
        "review_count",
        "district",
        "city",
        "region",
        "lat",
        "lng",
        "delivery_radius_km",
        "store_kind",
      ].join(", ")
    )
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    /** v4 PL-01 — 실매장은 배달 가능 매장만, 샘플은 배달 조건 면제 (주문은 DB 가 차단) */
    .or(DELIVERY_SEARCH_STORE_DELIVERY_OR)
    .or(
      [
        `store_name.ilike."${pat}"`,
        `description.ilike."${pat}"`,
      ].join(",")
    )
    .order("rating_avg", { ascending: false })
    .order("review_count", { ascending: false })
    .limit(DELIVERY_SEARCH_STORE_FETCH_CAP);

  const productsQuery = sb
    .from("store_products")
    .select(DELIVERY_SEARCH_PRODUCT_SELECT)
    .eq("product_status", "active")
    .eq("local_delivery_available", true)
    .or([`title.ilike."${pat}"`, `summary.ilike."${pat}"`].join(","))
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(DELIVERY_SEARCH_MENU_FETCH_CAP);

  /**
   * v4 PL-01 — 샘플 매장 메뉴는 `local_delivery_available=false` 여도 검색에 노출한다 (주문은 DB 차단 유지).
   * 실매장 메뉴 조건(위 쿼리)은 그대로 두고, 샘플 부모 매장 메뉴만 inner embed 로 별도 병렬 조회 → 병합.
   */
  const sampleProductsQuery = sb
    .from("store_products")
    .select(`${DELIVERY_SEARCH_PRODUCT_SELECT}, stores!inner ( store_kind )`)
    .eq("product_status", "active")
    .eq("stores.store_kind", "sample")
    .or([`title.ilike."${pat}"`, `summary.ilike."${pat}"`].join(","))
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(DELIVERY_SEARCH_MENU_FETCH_CAP);

  const [storesRes, prodsRes, sampleProdsRes] = await Promise.all([
    storesQuery,
    productsQuery,
    sampleProductsQuery,
  ]);

  const stores: DeliverySearchStoreResult[] =
    (storesRes.data ?? [])
      .map((r) => {
        /** S-03 — 원문 `store_kind` 는 응답에 싣지 않고 boolean 으로만 */
        const { store_kind: kind, ...rest } = r as unknown as Record<string, unknown>;
        return { ...rest, isSampleStore: isSampleStoreKind(kind) } as unknown as DeliverySearchStoreResult;
      })
      .filter((s) => !!s?.id && !!s?.slug)
      .filter((s) => matchDeliveryStoreGlobalSearch(s, parsed.keyword).matched) ?? [];

  const prodsMerged = mergeDeliverySearchProductRows(
    (prodsRes.data ?? []) as unknown as ProductRow[],
    (sampleProdsRes.data ?? []) as unknown as ProductRow[]
  );
  const prodsRaw = prodsMerged.filter(
    (p) =>
      // DSC-09 — 노출 = 주문 가능: 검수 반려·재검수 대기·숨김 구역 상품은 상세·주문과 같은 규칙으로 제외
      !storeProductBuyerVisibilityBlocked(p) &&
      matchDeliveryMenuGlobalSearch(
        { title: String(p.title ?? ""), summary: p.summary != null ? String(p.summary) : null },
        parsed.keyword
      ).matched
  );
  const storeIdsFromProducts = Array.from(
    new Set(prodsRaw.map((p) => String(p.store_id ?? "")).filter(Boolean))
  );

  /**
   * Menu match loads parent store metadata for the menu card / eligibility only.
   * Do not promote the parent into the keyword Store section.
   */
  const deliveryStoreById = new Map<string, DeliverySearchStoreResult>();
  if (storeIdsFromProducts.length > 0) {
    const { data: storeMeta } = await sb
      .from("stores")
      .select(
        [
          "id",
          "slug",
          "store_name",
          "description",
          "profile_image_url",
          "rating_avg",
          "review_count",
          "district",
          "city",
          "region",
          "lat",
          "lng",
          "delivery_radius_km",
          "store_kind",
        ].join(", ")
      )
      .in("id", storeIdsFromProducts)
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .or(DELIVERY_SEARCH_STORE_DELIVERY_OR)
      .limit(200);
    for (const row of (storeMeta ?? []) as unknown as DeliverySearchStoreResult[]) {
      const id = String(row?.id ?? "");
      const slug = String(row?.slug ?? "");
      if (!id || !slug) continue;
      deliveryStoreById.set(id, {
        id,
        slug,
        store_name: String((row as any).store_name ?? ""),
        description: (row as any).description != null ? String((row as any).description) : null,
        profile_image_url:
          (row as any).profile_image_url != null ? String((row as any).profile_image_url) : null,
        rating_avg: (row as any).rating_avg != null ? Number((row as any).rating_avg) : null,
        review_count: (row as any).review_count != null ? Number((row as any).review_count) : null,
        district: (row as any).district != null ? String((row as any).district) : null,
        city: (row as any).city != null ? String((row as any).city) : null,
        region: (row as any).region != null ? String((row as any).region) : null,
        lat: (row as any).lat != null ? Number((row as any).lat) : null,
        lng: (row as any).lng != null ? Number((row as any).lng) : null,
        delivery_radius_km:
          (row as any).delivery_radius_km != null && Number.isFinite(Number((row as any).delivery_radius_km))
            ? Number((row as any).delivery_radius_km)
            : null,
        isSampleStore: isSampleStoreKind((row as any).store_kind),
      });
    }
  }

  // Keyword store hits only. Menu parents stay in deliveryStoreById for menu cards.
  const byId = new Map<string, DeliverySearchStoreResult>();
  const merged: DeliverySearchStoreResult[] = [];
  for (const s of stores) {
    if (!s?.id || byId.has(s.id)) continue;
    byId.set(s.id, s);
    merged.push(s);
  }
  /** DSC-03 — storeLimit 은 지역 노출 판정 뒤에 적용 */
  const mergedStoresRaw = merged;

  const customerLat = input.origin.lat;
  const customerLng = input.origin.lng;

  const svcCtx = await loadDeliveryServiceabilityRuntimeContext(sb as SupabaseClient);
  const originSource: DeliveryListOriginSource = input.origin.source;
  /**
   * Eligibility authority = keyword stores ∪ menu parent stores.
   * Do not load service-area only for remaining keyword hits — OOR parents
   * would disappear from the map and their menus would leak.
   */
  const eligibilityStoreIds = unionDeliverySearchServiceAreaStoreIds(
    mergedStoresRaw.map((s) => s.id),
    [...deliveryStoreById.keys()]
  );
  const serviceAreaById = await loadStoreServiceAreaRuntimeMap(
    sb as SupabaseClient,
    eligibilityStoreIds
  );
  const memberLguId = input.origin.canonicalLguId;
  const storesByIdForEligibility = new Map<string, DeliverySearchStoreResult>();
  for (const s of mergedStoresRaw) storesByIdForEligibility.set(s.id, s);
  for (const [id, s] of deliveryStoreById) {
    if (!storesByIdForEligibility.has(id)) storesByIdForEligibility.set(id, s);
  }
  const eligibilityByStoreId = new Map<string, DeliverySearchStoreEligibility>();
  for (const id of eligibilityStoreIds) {
    const s = storesByIdForEligibility.get(id);
    if (!s) continue;
    const area = serviceAreaById.get(id);
    const svc = evaluateStoreDeliveryServiceability({
      ctx: svcCtx,
      storeId: id,
      storeDeliveryRadiusKm: s.delivery_radius_km,
      customerLat,
      customerLng,
      storeLat: s.lat,
      storeLng: s.lng,
      authorityMode: area?.authorityMode ?? DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: area?.selectedLguIds ?? [],
      memberLguId,
    });
    eligibilityByStoreId.set(id, resolveDeliverySearchStoreEligibility({ originSource, svc }));
  }
  const annotated = mergedStoresRaw.map((s) => {
    const elig = eligibilityByStoreId.get(s.id);
    return {
      ...s,
      distanceKm: elig?.distanceKm ?? null,
      distanceOutOfRange: elig?.distanceOutOfRange === true,
      maxDeliveryDistanceKm: elig?.maxDeliveryDistanceKm ?? null,
      distancePolicyApplied: elig?.distancePolicyApplied === true,
    };
  });
  const mergedStores: DeliverySearchStoreResult[] = annotated
    .filter((s) =>
      isDeliverySearchStoreVisible({
        originSource,
        eligibility: eligibilityByStoreId.get(s.id),
      })
    )
    .slice(0, storeLimit);

  const menus: DeliverySearchMenuResult[] = [];
  /** Display metadata only — never used as delivery eligibility authority. */
  const storeMetaById = new Map<string, { slug: string; store_name: string; isSampleStore: boolean }>();
  for (const [id, row] of deliveryStoreById) {
    storeMetaById.set(id, {
      slug: row.slug,
      store_name: row.store_name,
      isSampleStore: row.isSampleStore === true,
    });
  }
  for (const s of mergedStores) {
    if (!storeMetaById.has(s.id)) {
      storeMetaById.set(s.id, {
        slug: s.slug,
        store_name: s.store_name,
        isSampleStore: s.isSampleStore === true,
      });
    }
  }
  for (const p of prodsRaw) {
    if (menus.length >= menuLimit) break;
    const id = String(p.id ?? "");
    const store_id = String(p.store_id ?? "");
    const meta = storeMetaById.get(store_id);
    if (!id || !store_id) continue;
    if (
      !isDeliverySearchMenuVisible({
        originSource,
        parentStoreMetaExists: !!meta,
        parentEligibility: eligibilityByStoreId.get(store_id),
      })
    ) {
      continue;
    }
    if (!meta) continue;
    const price = Number(p.price);
    const discount_price = p.discount_price != null ? Number(p.discount_price) : null;
    menus.push({
      id,
      store_id,
      store_slug: meta.slug,
      store_name: meta.store_name,
      title: String(p.title ?? ""),
      summary: p.summary != null ? String(p.summary) : null,
      price: Number.isFinite(price) ? price : 0,
      discount_price: discount_price != null && Number.isFinite(discount_price) ? discount_price : null,
      thumbnail_url: p.thumbnail_url != null ? String(p.thumbnail_url) : null,
      isSampleStore: meta.isSampleStore,
    });
  }

  const result_count = mergedStores.length + menus.length;
  /** v4 PERF-12 — 검색 디버그 로그는 개발 모드에서만 (운영 요청마다 console.log 제거) */
  if (process.env.NODE_ENV === "development") {
    console.log("[delivery-search-debug]", {
      keyword,
      keywordFields: DELIVERY_SEARCH_KEYWORD_FIELDS,
      rawMatchedProducts: prodsRaw.length,
      matchedStores: stores.length,
      deliveryStoreIds: deliveryStoreById.size,
      finalStores: mergedStores.length,
      finalMenus: menus.length,
    });
  }
  const debug: DeliverySearchDebug | undefined =
    process.env.NODE_ENV !== "production" && result_count === 0
      ? {
          keyword,
          storeTable: "stores",
          menuTable: "store_products",
          storeConditions: ["approval_status=approved", "is_visible=true", "delivery_available=true OR store_kind=sample"],
          menuConditions: ["product_status=active", "local_delivery_available=true OR parent store_kind=sample"],
          matchedStoresCount: mergedStores.length,
          rawMatchedProductsCount: prodsRaw.length,
          deliveryStoreIdsCount: deliveryStoreById.size,
          finalMenusCount: menus.length,
        }
      : undefined;

  let searchTopBanner: SearchTopBannerSlide | null = null;
  try {
    searchTopBanner = await loadStoresSearchTopBannerSlide(sb as SupabaseClient, {
      organicStoreIds: mergedStores.map((s) => s.id),
      query: keyword,
    });
  } catch (e) {
    console.error("[delivery-search] searchTopBanner", e instanceof Error ? e.message : e);
    searchTopBanner = null;
  }

  return {
    ok: true,
    stores: mergedStores,
    menus,
    result_count,
    meta,
    searchTopBanner,
    debug,
  };
}

