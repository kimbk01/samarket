/**
 * DIBAY Marketplace LIST + SEARCH query extras — ONE contract.
 * Home `/market`, category `/market?category=`, `/search` must apply the same filters.
 *
 * DO NOT: client-filter page-1 rows; ORDER BY city as "distance"; silent ALL as default.
 * Location authority is TradeLocationScope (URL). Status machine is out of this module.
 */

export type MarketplaceQuerySort = "newest" | "distance";

export type MarketplaceQueryExtras = {
  q?: string;
  priceMin?: number;
  priceMax?: number;
  sort: MarketplaceQuerySort;
};

const ILIKE_UNSAFE = /[%_,*()\\]/g;
const QUERY_MAX_LEN = 80;

export function sanitizeMarketplaceQueryText(raw: string | null | undefined): string | undefined {
  const t = (raw ?? "").trim().replace(ILIKE_UNSAFE, " ").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.slice(0, QUERY_MAX_LEN);
}

export function parseMarketplacePriceBound(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

export function parseMarketplaceSort(raw: string | null | undefined): MarketplaceQuerySort {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "distance" || s === "near") return "distance";
  return "newest";
}

export function marketplaceSortToFeedSort(sort: MarketplaceQuerySort): "latest" | "near" {
  return sort === "distance" ? "near" : "latest";
}

export function marketplaceQueryCacheSegment(extras: {
  q?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sort?: string | null;
}): string {
  const q = sanitizeMarketplaceQueryText(extras.q) ?? "";
  const min = parseMarketplacePriceBound(extras.priceMin ?? undefined);
  const max = parseMarketplacePriceBound(extras.priceMax ?? undefined);
  const sort = parseMarketplaceSort(extras.sort);
  return `q:${q}:pmin:${min ?? ""}:pmax:${max ?? ""}:ms:${sort}`;
}

type PostgrestFilterQ = {
  ilike: (column: string, pattern: string) => PostgrestFilterQ;
  gte: (column: string, value: number) => PostgrestFilterQ;
  lte: (column: string, value: number) => PostgrestFilterQ;
};

/**
 * Title + price range. Location/category/status stay on existing apply helpers.
 * Distance sort is NOT applied here (LGU centroid, server page fetcher).
 */
export function appendMarketplaceQuerySearchParams(
  params: URLSearchParams,
  extras: { q?: string | null; priceMin?: number | null; priceMax?: number | null }
): void {
  const text = sanitizeMarketplaceQueryText(extras.q);
  if (text) params.set("q", text);
  const min = parseMarketplacePriceBound(extras.priceMin ?? undefined);
  const max = parseMarketplacePriceBound(extras.priceMax ?? undefined);
  if (min != null) params.set("priceMin", String(min));
  if (max != null) params.set("priceMax", String(max));
}

export function appendMarketplaceLocationSearchParams(
  params: URLSearchParams,
  opts: { locationAll?: boolean; lguCityId?: string | null; radiusKm?: number | null }
): void {
  const lgu = opts.lguCityId?.trim();
  if (lgu) {
    params.set("location", "city");
    params.set("lgu", lgu);
    if (opts.radiusKm != null && Number.isFinite(Number(opts.radiusKm))) {
      params.set("radius", String(Math.round(Number(opts.radiusKm))));
    }
    return;
  }
  if (opts.locationAll) params.set("location", "all");
}

export function applyMarketplaceQueryToPostgrest<T extends PostgrestFilterQ>(
  query: T,
  extras: { q?: string; priceMin?: number; priceMax?: number }
): T {
  let q = query;
  const text = sanitizeMarketplaceQueryText(extras.q);
  if (text) {
    q = q.ilike("title", `%${text}%`) as T;
  }
  const min = parseMarketplacePriceBound(extras.priceMin);
  const max = parseMarketplacePriceBound(extras.priceMax);
  if (min != null) q = q.gte("price", min) as T;
  if (max != null) q = q.lte("price", max) as T;
  return q;
}
