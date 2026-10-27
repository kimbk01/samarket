/**
 * 거래 목록·필터·찾기 — DB 함수 `trade_list_page` 하나로 순서·페이지를 정한다
 * (`docs/dibay-marketplace-list-ssot-target.md`, 재설계 4-3, 마이그레이션 20270705120000).
 *
 * 모든 공개 거래 글이 한 번의 ORDER BY 로 정렬되고, 다음 페이지는 마지막 글의 키(cursor)로 이어 읽는다.
 * 지역 구간·거리 km 는 앱의 전국 LGU 데이터(SSOT)로 여기서 계산해 함수에 넘긴다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CompositionFilterClause } from "@/lib/trade/category-form/composition-filter-query";
import {
  listTradeNationalLgus,
  loadTradeNationalLguDataset,
} from "@/lib/trade/location/national/load-national-lgu-dataset";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import {
  resolveListLocationPlan,
  type ListHoodAnchor,
} from "@/lib/trade/marketplace/list-contract/list-location-blocks";
import type { ListTradeStateChoice } from "@/lib/trade/marketplace/list-contract/list-segments";
import { listingLguDistanceKm } from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";

export type TradeListSort = "latest" | "popular" | "distance";

/** 함수가 맵에 없는 글에 쓰는 거리(km) — 「거리 모름」은 맨 뒤 */
const UNKNOWN_DISTANCE_KM = 1e9;

export type TradeListLocationParams = {
  loc_lgu: Record<string, [number, number]>;
  loc_legacy: Record<string, [number, number]>;
  loc_hood: { r: string; c: string; from: number; to: number } | null;
  loc_default: number;
  loc_parts: string[];
};

const locationParamsCache = new Map<string, TradeListLocationParams>();

function finiteKm(km: number): number {
  return Number.isFinite(km) ? Math.round(km * 1000) / 1000 : UNKNOWN_DISTANCE_KM;
}

/**
 * 기준 위치·반경·내 동네 → 지역 구간 맵. 같은 입력이면 결과가 같아 프로세스 메모리에 둔다.
 * 거리순이 아니면 기본 구간(그 외)이 아닌 시만 넣는다.
 */
export function buildTradeListLocationParams(input: {
  lguCityId: string | null | undefined;
  radiusKm: number | null | undefined;
  hood: ListHoodAnchor | null;
  withDistance: boolean;
}): TradeListLocationParams {
  const constraint = resolveTradeFeedLocationConstraint(input.lguCityId ?? null, input.radiusKm ?? null);
  const plan = resolveListLocationPlan(constraint, input.hood);
  const cacheKey = [
    constraint.kind === "lgu" ? `${constraint.canonicalId}:${constraint.radiusKm ?? "all"}` : constraint.kind,
    plan.hood ? `${plan.hood.regionId}|${plan.hood.cityId}` : "",
    input.withDistance ? "d" : "",
  ].join(":");
  const cached = locationParamsCache.get(cacheKey);
  if (cached) return cached;

  const lastIndex = plan.blocks.length - 1;
  const loc_parts = plan.blocks.map((b) => (b.part ? `loc:${b.part}` : ""));
  const anchor = plan.anchorCanonicalId;
  const loc_lgu: Record<string, [number, number]> = {};
  const loc_legacy: Record<string, [number, number]> = {};

  if (constraint.kind === "lgu" && anchor) {
    for (const lgu of listTradeNationalLgus()) {
      const tier = plan.blockOf({ trade_lgu_id: lgu.canonicalId, region: null, city: null });
      if (tier === lastIndex && !input.withDistance) continue;
      const km = input.withDistance ? finiteKm(listingLguDistanceKm({ trade_lgu_id: lgu.canonicalId }, anchor)) : 0;
      loc_lgu[lgu.canonicalId] = [tier, km];
    }
    for (const area of loadTradeNationalLguDataset().localAreaMap) {
      const row = { trade_lgu_id: null, region: area.regionId, city: area.cityId };
      const tier = plan.blockOf(row);
      if (tier === lastIndex && !input.withDistance) continue;
      const km = input.withDistance ? finiteKm(listingLguDistanceKm(row, anchor)) : 0;
      loc_legacy[`${area.regionId}|${area.cityId}`] = [tier, km];
    }
  }

  const params: TradeListLocationParams = {
    loc_lgu,
    loc_legacy,
    loc_hood: plan.hood
      ? { r: plan.hood.regionId, c: plan.hood.cityId, from: plan.hood.fromIndex, to: plan.hood.toIndex }
      : null,
    loc_default: lastIndex,
    loc_parts,
  };
  if (locationParamsCache.size > 200) locationParamsCache.clear();
  locationParamsCache.set(cacheKey, params);
  return params;
}

export type TradeListPageInput = {
  universeTradeCategoryIds: string[] | null;
  /** 고른 물품(하위 주제가 있으면 그것, 없으면 상위 주제) */
  primaryTradeCategoryIds: string[] | null;
  /** 같은 상위의 나머지(하위 주제를 골랐을 때만) */
  similarTradeCategoryIds: string[] | null;
  compositionFilters: CompositionFilterClause[] | null | undefined;
  priceMin: number | undefined;
  priceMax: number | undefined;
  tradeState: ListTradeStateChoice;
  q: string;
  sort: TradeListSort;
  location: TradeListLocationParams;
  limit: number;
  /** 커서가 없을 때만 — 커서를 모르는 예전 화면의 page 요청 */
  offset: number;
  cursor: unknown[] | null;
};

export type TradeListPageRow = { id: string; list_section: string; sort_key: unknown[] };

export type TradeListPageResult = {
  rows: TradeListPageRow[];
  hasMore: boolean;
  nextCursor: string | null;
};

export function encodeTradeListCursor(key: unknown[]): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

/** 잘못된 값이면 null — 호출부는 첫 페이지처럼 다룬다 */
export function decodeTradeListCursor(raw: string | null | undefined): unknown[] | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 1024) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    return Array.isArray(parsed) && parsed.length === 9 ? parsed : null;
  } catch {
    return null;
  }
}

/** null = DB 실패(호출부는 빈 목록이 아니라 오류로 답한다) */
export async function fetchTradeListPage(
  sb: SupabaseClient<any>,
  input: TradeListPageInput
): Promise<TradeListPageResult | null> {
  const p = {
    universe: input.universeTradeCategoryIds?.length ? input.universeTradeCategoryIds : null,
    cat_primary: input.primaryTradeCategoryIds?.length ? input.primaryTradeCategoryIds : null,
    cat_similar: input.similarTradeCategoryIds?.length ? input.similarTradeCategoryIds : null,
    comp: input.compositionFilters?.length ? input.compositionFilters : null,
    price_min: input.priceMin ?? null,
    price_max: input.priceMax ?? null,
    trade_state: input.tradeState,
    q: input.q || null,
    sort: input.sort,
    limit: input.limit,
    offset: input.cursor ? 0 : input.offset,
    cursor: input.cursor,
    ...input.location,
  };
  const { data, error } = await sb.rpc("trade_list_page", { p });
  if (error || !Array.isArray(data)) return null;
  const all = (data as Array<{ id?: unknown; list_section?: unknown; sort_key?: unknown }>).map((r) => ({
    id: String(r.id ?? ""),
    list_section: typeof r.list_section === "string" ? r.list_section : "",
    sort_key: Array.isArray(r.sort_key) ? r.sort_key : [],
  }));
  const hasMore = all.length > input.limit;
  const rows = hasMore ? all.slice(0, input.limit) : all;
  const last = rows[rows.length - 1];
  return {
    rows,
    hasMore,
    nextCursor: hasMore && last ? encodeTradeListCursor(last.sort_key) : null,
  };
}

/** 순위 행의 안내 줄 키를 상세 행에 옮긴다(순서 유지, 그 사이 지워진 글은 빠짐) */
export function attachTradeListSections(
  rows: TradeListPageRow[],
  hydrated: PostWithMeta[]
): PostWithMeta[] {
  const sectionById = new Map(rows.map((r) => [r.id, r.list_section]));
  return hydrated.map((p) => ({ ...p, list_section: sectionById.get(p.id) ?? "" }));
}

/**
 * 거래 C L-2: 다음 페이지 기준 = **실제로 보여 준 마지막 일반 글**의 정렬 키.
 * 1페이지에 홍보 글을 끼우면 일반 글 뒤쪽이 잘리는데(1페이지 개수 50 유지), 순위 50번째 키를 그대로 쓰면
 * 잘린 일반 글이 다음 페이지에서도 빠진다. 잘린 행이 있으면 hasMore 는 true.
 */
export function resolveShownTradeListPageCursor(args: {
  rows: TradeListPageRow[];
  shownPosts: ReadonlyArray<{ id: string }>;
  promotedIdsOnPage: ReadonlyArray<string>;
  ranked: { hasMore: boolean; nextCursor: string | null };
}): { hasMore: boolean; nextCursor: string | null } {
  const { rows, shownPosts, ranked } = args;
  if (rows.length === 0) return ranked;
  const promoted = new Set(args.promotedIdsOnPage);
  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  let lastShownIdx = -1;
  for (const p of shownPosts) {
    if (promoted.has(p.id)) continue;
    const idx = rowIndex.get(p.id);
    if (idx != null && idx > lastShownIdx) lastShownIdx = idx;
  }
  if (lastShownIdx < 0 || lastShownIdx >= rows.length - 1) return ranked;
  return { hasMore: true, nextCursor: encodeTradeListCursor(rows[lastShownIdx]!.sort_key) };
}
