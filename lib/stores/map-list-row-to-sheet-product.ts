/**
 * GET /api/stores/:slug 의 products[] 행 → 메뉴 담기 시트용 최소 페이로드.
 * (단건 API 와 동일 필드면 보강 fetch 생략 가능)
 */
import type { StoreDetailLike } from "@/lib/stores/store-public-page-hydrate";

export type SheetPublicProduct = {
  id: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  stock_qty: number;
  track_inventory?: boolean | null;
  min_order_qty: number | null;
  max_order_qty: number | null;
  thumbnail_url: string | null;
  images_json?: unknown;
  pickup_available: boolean | null;
  local_delivery_available: boolean | null;
  shipping_available: boolean | null;
  options_json?: unknown;
};

export type SheetPublicStore = {
  id: string;
  slug: string;
  store_name: string;
  business_hours_json?: unknown;
  is_open?: boolean | null;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  favorite_count?: number;
  recent_order_count?: number;
};

export function mapListRowToSheetProduct(
  row: Record<string, unknown>,
  store: StoreDetailLike,
  meta: { favoriteCount: number; recentOrderCount: number }
): { product: SheetPublicProduct; store: SheetPublicStore } | null {
  const id = String(row.id ?? "");
  if (!id) return null;
  const price = Number(row.price);
  const disc = row.discount_price != null ? Number(row.discount_price) : null;
  const minRaw = Number(row.min_order_qty);
  const maxRaw = Number(row.max_order_qty);
  const min_order_qty =
    Number.isFinite(minRaw) && minRaw > 0 ? Math.max(1, Math.floor(minRaw)) : 1;
  const max_order_qty =
    Number.isFinite(maxRaw) && maxRaw > 0 ? Math.max(min_order_qty, Math.floor(maxRaw)) : 99;

  const product: SheetPublicProduct = {
    id,
    title: String(row.title ?? ""),
    summary: row.summary != null ? String(row.summary) : null,
    price: Number.isFinite(price) ? price : 0,
    discount_price: disc != null && Number.isFinite(disc) ? disc : null,
    stock_qty: Math.max(0, Math.floor(Number(row.stock_qty ?? 0)) || 0),
    track_inventory: row.track_inventory === true,
    min_order_qty,
    max_order_qty,
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    images_json: row.images_json,
    pickup_available: row.pickup_available != null ? !!row.pickup_available : null,
    local_delivery_available:
      row.local_delivery_available != null ? !!row.local_delivery_available : null,
    shipping_available: row.shipping_available != null ? !!row.shipping_available : null,
    options_json: row.options_json,
  };

  const pubStore: SheetPublicStore = {
    id: store.id,
    slug: store.slug,
    store_name: store.store_name,
    business_hours_json: store.business_hours_json,
    is_open: store.is_open,
    delivery_available: store.delivery_available,
    pickup_available: store.pickup_available,
    rating_avg: store.rating_avg ?? null,
    review_count: store.review_count ?? null,
    favorite_count: meta.favoriteCount,
    recent_order_count: meta.recentOrderCount,
  };

  return { product, store: pubStore };
}
