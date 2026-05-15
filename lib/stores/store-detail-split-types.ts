/**
 * 클라이언트 파싱용 — API 라우트 페이로드와 정합.
 * `GET /api/stores/[slug]/menus` 확장 시 `parseStoreMenusPayload`·호출부를 함께 갱신한다.
 */
import type { StoreDetailLike } from "@/lib/stores/store-public-page-hydrate";

export type StoreSummaryCommerceMeta = {
  canSell?: boolean;
  source?: string;
  favorite_count?: unknown;
  recent_order_count?: unknown;
  viewer_favorited?: boolean;
};

export type StoreSummaryPayload = {
  ok: boolean;
  store?: (StoreDetailLike & { lat?: number | null; lng?: number | null }) | null;
  meta?: StoreSummaryCommerceMeta;
  error?: string;
};

export type StoreMenusCommerceMeta = StoreSummaryCommerceMeta & {
  menu_sold_out_bottom?: boolean;
  popular_menu?: {
    window_days: number;
    min_qty: number;
    top_n: number;
    recommended_max: number;
  };
};

/** 메뉴 API `categories[]` 항목 — `products` 와 동일 id */
export type StoreMenusCategoryPayload = {
  id: string | null;
  name: string;
  display_order: number;
  products?: unknown[];
};

export type StoreMenusPublicStore = {
  id?: string;
  slug?: string;
  store_name?: string;
  menu_sold_out_bottom?: boolean;
};

export type StoreMenusPayload = {
  ok: boolean;
  store?: StoreMenusPublicStore | null;
  products?: unknown[];
  /** 추천메뉴 스트립 순서(인기→사장님 추천 보충, 최대 5) */
  recommendedProductIds?: string[];
  popularProductIds?: string[];
  recommendedProducts?: unknown[];
  popularProducts?: unknown[];
  categories?: StoreMenusCategoryPayload[];
  meta?: StoreMenusCommerceMeta;
  error?: string;
};

export type StoreReviewsSummaryRecentItem = {
  id: unknown;
  rating: unknown;
  content?: string;
  created_at?: unknown;
  buyer_public_label?: unknown;
};

export type StoreReviewsSummaryPayload = {
  ok: boolean;
  avg_rating?: number | null;
  count?: number;
  recent?: StoreReviewsSummaryRecentItem[];
  distribution?: Partial<Record<"1" | "2" | "3" | "4" | "5", number>>;
  meta?: { source?: string; table_missing?: boolean };
  error?: string;
};

export function parseStoreSummaryPayload(json: unknown): StoreSummaryPayload {
  if (!json || typeof json !== "object") return { ok: false };
  const j = json as Record<string, unknown>;
  return {
    ok: j.ok === true,
    store: (j.store as StoreSummaryPayload["store"]) ?? null,
    meta: j.meta as StoreSummaryCommerceMeta | undefined,
    error: typeof j.error === "string" ? j.error : undefined,
  };
}

export function parseStoreMenusPayload(json: unknown): StoreMenusPayload {
  if (!json || typeof json !== "object") return { ok: false };
  const j = json as Record<string, unknown>;
  const rec = j.recommendedProductIds;
  const pop = j.popularProductIds;
  const cats = j.categories;
  return {
    ok: j.ok === true,
    store: (j.store as StoreMenusPublicStore | null | undefined) ?? null,
    products: Array.isArray(j.products) ? j.products : undefined,
    recommendedProductIds: Array.isArray(rec)
      ? rec.map((x) => String(x ?? "").trim()).filter(Boolean)
      : undefined,
    popularProductIds: Array.isArray(pop)
      ? pop.map((x) => String(x ?? "").trim()).filter(Boolean)
      : undefined,
    recommendedProducts: Array.isArray(j.recommendedProducts) ? j.recommendedProducts : undefined,
    popularProducts: Array.isArray(j.popularProducts) ? j.popularProducts : undefined,
    categories: Array.isArray(cats) ? (cats as StoreMenusCategoryPayload[]) : undefined,
    meta: j.meta as StoreMenusCommerceMeta | undefined,
    error: typeof j.error === "string" ? j.error : undefined,
  };
}

export function parseStoreReviewsSummaryPayload(json: unknown): StoreReviewsSummaryPayload {
  if (!json || typeof json !== "object") return { ok: false };
  const j = json as Record<string, unknown>;
  return {
    ok: j.ok === true,
    avg_rating: j.avg_rating === null || j.avg_rating === undefined ? null : Number(j.avg_rating),
    count: typeof j.count === "number" ? j.count : Number(j.count),
    recent: Array.isArray(j.recent) ? (j.recent as StoreReviewsSummaryRecentItem[]) : undefined,
    distribution: j.distribution as StoreReviewsSummaryPayload["distribution"],
    meta: j.meta as StoreReviewsSummaryPayload["meta"],
    error: typeof j.error === "string" ? j.error : undefined,
  };
}
