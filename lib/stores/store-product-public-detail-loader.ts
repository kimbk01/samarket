import "server-only";

import { cache } from "react";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";
import { loadStorePublicMenuOpen } from "@/lib/stores/store-public-menu-open";
import { stripStoreProductPublicInternalFields } from "@/lib/stores/store-product-public-response";

/**
 * v4 재감사 PERF-09 · API-14 — 공개 매장 상품 단건 서버 로더 (단일 정의).
 *
 * - `GET /api/stores/products/[productId]` 와 상품 페이지 `generateMetadata` 가 같이 쓴다.
 *   메타가 자기 API 를 HTTP 로 다시 부르던 경로(쿠키 없는 공유 크롤러는 API 게이트에 막힘)를 대체한다.
 * - 노출 판정 순서는 기존 API 와 같다: 상품(active·sold_out) 404 → 검수·숨김 구역 404 → 매장 승인·노출 404 → 메뉴 공개 404.
 */
export type StoreProductPublicRow = { store_id: string } & Record<string, unknown>;

export const STORE_PRODUCT_PUBLIC_SELECT = [
  "id, store_id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory",
  "min_order_qty, max_order_qty, thumbnail_url, images_json, options_json, product_status",
  "pickup_available, local_delivery_available, shipping_available",
  "category_id, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, created_at",
  "admin_review_status",
  "store_menu_sections ( id, name, sort_order, is_hidden )",
  "store_product_categories ( name, slug )",
].join(", ");

export const STORE_PRODUCT_PUBLIC_STORE_SELECT =
  "id, owner_user_id, slug, store_name, approval_status, is_visible, phone, region, city, district, is_open, business_hours_json, profile_image_url, delivery_available, pickup_available, rating_avg, review_count, store_kind";

export type StoreProductPublicStoreRow = {
  id: string;
  owner_user_id: string | null;
  slug: string | null;
  store_name: string | null;
  approval_status: string | null;
  is_visible: boolean | null;
  phone?: unknown;
  region?: unknown;
  city?: unknown;
  district?: unknown;
  is_open?: unknown;
  business_hours_json?: unknown;
  profile_image_url?: unknown;
  delivery_available?: unknown;
  pickup_available?: unknown;
  rating_avg?: unknown;
  review_count?: unknown;
  store_kind?: unknown;
};

type StoresSb = NonNullable<ReturnType<typeof tryGetSupabaseForStores>>;

/** 1단계 — 상품 행 + 구매자 노출 판정. 노출 불가면 null (내부 필드는 제거된 행). */
export async function loadStoreProductPublicRow(
  sb: StoresSb,
  productId: string
): Promise<StoreProductPublicRow | null> {
  const id = String(productId ?? "").trim();
  if (!id) return null;
  const { data: product, error } = await sb
    .from("store_products")
    .select(STORE_PRODUCT_PUBLIC_SELECT)
    .eq("id", id)
    .in("product_status", ["active", "sold_out"])
    .maybeSingle();
  if (error || !product) return null;
  const prod = product as unknown as StoreProductPublicRow;
  // PRD-03 · PRD-05 — 노출 = 주문 가능: 검수 반려·재검수 대기, 숨김 구역 상품은 메뉴판과 같이 404.
  if (storeProductBuyerVisibilityBlocked(prod)) return null;
  stripStoreProductPublicInternalFields(prod);
  return prod;
}

/** 2단계 — 매장 행(승인·노출) + 메뉴 공개. 공개 불가면 null. */
export async function loadStoreProductPublicStore(
  sb: StoresSb,
  storeId: string
): Promise<StoreProductPublicStoreRow | null> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return null;
  const [storeRes, menuOpen] = await Promise.all([
    sb.from("stores").select(STORE_PRODUCT_PUBLIC_STORE_SELECT).eq("id", sid).maybeSingle(),
    /**
     * S-01 — 상품 노출 = 메뉴 공개(DB `store_public_menu_open`: 판매 승인 OR 샘플).
     * 판매 미승인 실매장은 404. 판매 가능(canSell)은 주문 게이트(`store_not_selling`)에서만 판정.
     */
    loadStorePublicMenuOpen(sb, sid),
  ]);
  const store = storeRes.data as StoreProductPublicStoreRow | null;
  if (storeRes.error || !store || store.approval_status !== "approved" || !store.is_visible) return null;
  if (!menuOpen) return null;
  return store;
}

export type StoreProductPublicMeta = {
  product: {
    title: string | null;
    summary: string | null;
    thumbnail_url: string | null;
    images_json: unknown;
  };
  store: { store_name: string | null; slug: string | null };
};

/**
 * 상품 페이지 메타용 — 요청 단위 `cache` (같은 렌더 안 중복 호출 1회). 쿠키·뷰어와 무관한 공개 값만 반환.
 */
export const loadStoreProductPublicMetaCached = cache(
  async (productId: string): Promise<StoreProductPublicMeta | null> => {
    const sb = tryGetSupabaseForStores();
    if (!sb) return null;
    const prod = await loadStoreProductPublicRow(sb, productId);
    if (!prod) return null;
    const store = await loadStoreProductPublicStore(sb, String(prod.store_id ?? ""));
    if (!store) return null;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      product: {
        title: str(prod.title),
        summary: str(prod.summary),
        thumbnail_url: str(prod.thumbnail_url),
        images_json: prod.images_json ?? null,
      },
      store: { store_name: str(store.store_name), slug: str(store.slug) },
    };
  }
);
