/**
 * 클라이언트 파싱용 — API 라우트 페이로드와 정합. 임의 계약 변경 금지.
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
  popular_menu?: {
    window_days: number;
    min_qty: number;
    top_n: number;
    recommended_max: number;
  };
};

export type StoreMenusPayload = {
  ok: boolean;
  products?: unknown[];
  /** 사장님 추천·대표 상단 섹션 순서(동일 id는 products·카테고리에도 존재) */
  recommendedProductIds?: string[];
  /** 인기 메뉴 순서(주문 집계, 미달 시 빈 배열) */
  popularProductIds?: string[];
  meta?: StoreMenusCommerceMeta;
  error?: string;
};

export type StoreReviewsSummaryRecentItem = {
  id: unknown;
  rating: unknown;
  content?: unknown;
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
  return {
    ok: j.ok === true,
    products: Array.isArray(j.products) ? j.products : undefined,
    recommendedProductIds: Array.isArray(rec)
      ? rec.map((x) => String(x ?? "").trim()).filter(Boolean)
      : undefined,
    popularProductIds: Array.isArray(pop)
      ? pop.map((x) => String(x ?? "").trim()).filter(Boolean)
      : undefined,
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
