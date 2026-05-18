/**
 * GET /api/stores/:slug 응답 → `StoreDetailPublic` 초기 상태·목록 행 맵.
 * 서버 선조회와 클라 `loadDetail` 이 동일 산출을 쓰도록 단일 변환.
 */
import type { StoreApiJsonResponse } from "@/lib/stores/store-delivery-api-client";
import {
  parseStoreDetailProducts,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";

export type StoreDetailLike = {
  id: string;
  store_name: string;
  slug: string;
  business_type: string | null;
  description: string | null;
  phone: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  gallery_images_json: unknown;
  is_open: boolean | null;
  business_hours_json: unknown;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type StorePublicPageHydrated = {
  store: StoreDetailLike | null;
  products: StoreDetailProductCard[];
  /** 시트 즉시 오픈용 원본 행(id → PostgREST 행) */
  productRowsById: Record<string, Record<string, unknown>>;
  canSell: boolean;
  dbOff: boolean;
  favoriteSeed: { viewerFavorited: boolean; favoriteCount: number };
  recentOrderCountMeta: number;
  orderability: {
    viewerIsOwner: boolean;
    viewerIsAdmin: boolean;
    canOrderStore: boolean;
    ownerBlockMessage: string | null;
  };
};

export function storePublicProductRowsMap(products: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!Array.isArray(products)) return out;
  for (const r of products) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (id) out[id] = o;
  }
  return out;
}

/** API JSON 본문만 — status 는 호출부에서 확인 */
export function hydrateStorePublicFromApiJson(json: unknown): StorePublicPageHydrated {
  const j = json as {
    ok?: boolean;
    store?: StoreDetailLike & { lat?: number | null; lng?: number | null };
    products?: unknown;
    meta?: {
      source?: string;
      canSell?: boolean;
      viewer_favorited?: boolean;
      favorite_count?: unknown;
      recent_order_count?: unknown;
      viewer_is_owner?: boolean;
      viewer_is_admin?: boolean;
      can_order_store?: boolean;
      owner_block_message?: string | null;
    };
  };
  const nextDbOff = j?.meta?.source === "supabase_unconfigured";
  if (nextDbOff) {
    return {
      store: null,
      products: [],
      productRowsById: {},
      canSell: false,
      dbOff: true,
      favoriteSeed: { viewerFavorited: false, favoriteCount: 0 },
      recentOrderCountMeta: 0,
      orderability: {
        viewerIsOwner: false,
        viewerIsAdmin: false,
        canOrderStore: true,
        ownerBlockMessage: null,
      },
    };
  }
  if (j?.ok && j.store) {
    const nextStore = {
      ...j.store,
      lat: j.store.lat ?? null,
      lng: j.store.lng ?? null,
    };
    const rawProducts = Array.isArray(j.products) ? j.products : [];
    const nextProducts = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(rawProducts));
    return {
      store: nextStore,
      products: nextProducts,
      productRowsById: storePublicProductRowsMap(rawProducts),
      canSell: !!j.meta?.canSell,
      dbOff: false,
      favoriteSeed: {
        viewerFavorited: !!j.meta?.viewer_favorited,
        favoriteCount: Number(j.meta?.favorite_count) || 0,
      },
      recentOrderCountMeta: Number(j.meta?.recent_order_count) || 0,
      orderability: {
        viewerIsOwner: !!j.meta?.viewer_is_owner,
        viewerIsAdmin: !!j.meta?.viewer_is_admin,
        canOrderStore: j.meta?.can_order_store !== false,
        ownerBlockMessage:
          typeof j.meta?.owner_block_message === "string" ? j.meta.owner_block_message : null,
      },
    };
  }
  return {
    store: null,
    products: [],
    productRowsById: {},
    canSell: false,
    dbOff: false,
    favoriteSeed: { viewerFavorited: false, favoriteCount: 0 },
    recentOrderCountMeta: 0,
    orderability: {
      viewerIsOwner: false,
      viewerIsAdmin: false,
      canOrderStore: true,
      ownerBlockMessage: null,
    },
  };
}

export function hydrateFromStoreApiResponse(res: StoreApiJsonResponse | null | undefined): StorePublicPageHydrated | null {
  if (!res || res.status !== 200) return null;
  return hydrateStorePublicFromApiJson(res.json);
}

export type StorePublicInitialSnapshot = StorePublicPageHydrated & { loading: boolean };

/** 클라 `useState(() => …)` 초기화 전용 — 첫 렌더 props 만 유효 */
export function getStorePublicInitialSnapshot(
  initialApiResponse?: StoreApiJsonResponse | null
): StorePublicInitialSnapshot {
  const h = hydrateFromStoreApiResponse(initialApiResponse ?? null);
  if (!h) {
    return {
      store: null,
      products: [],
      productRowsById: {},
      canSell: false,
      dbOff: false,
      favoriteSeed: { viewerFavorited: false, favoriteCount: 0 },
      recentOrderCountMeta: 0,
      orderability: {
        viewerIsOwner: false,
        viewerIsAdmin: false,
        canOrderStore: true,
        ownerBlockMessage: null,
      },
      loading: true,
    };
  }
  return {
    ...h,
    loading: h.dbOff ? false : !h.store,
  };
}
