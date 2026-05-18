import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { resolveStoreCartSheetPrefetchedRow } from "@/lib/stores/store-cart-sheet-prefetch";
import { openStoreProductSheet } from "@/lib/stores/store-product-sheet-ui-store";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import type { StoreDetailLike } from "@/lib/stores/store-public-page-hydrate";

export type StoreCartSheetStoreHead = {
  id: string;
  store_name: string;
  slug: string;
  profile_image_url?: string | null;
  business_hours_json: unknown;
  is_open: boolean | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
};

export function storeCartHeadToDetailLike(head: StoreCartSheetStoreHead): StoreDetailLike {
  return {
    id: head.id,
    store_name: head.store_name,
    slug: head.slug,
    business_type: null,
    description: null,
    phone: null,
    region: null,
    city: null,
    district: null,
    address_line1: null,
    address_line2: null,
    lat: null,
    lng: null,
    profile_image_url: head.profile_image_url ?? null,
    gallery_images_json: null,
    is_open: head.is_open,
    business_hours_json: head.business_hours_json,
    delivery_available: head.delivery_available,
    pickup_available: head.pickup_available,
  };
}

export function openStoreProductSheetFromCart(opts: {
  store: StoreCartSheetStoreHead;
  productId: string;
  editCartLine?: StoreCommerceCartLine | null;
  menusRowsById?: Record<string, Record<string, unknown>>;
  prefetchedListRow?: Record<string, unknown> | null;
}): void {
  const productId = String(opts.productId ?? "").trim();
  if (!productId) return;

  const prefetchedListRow =
    opts.prefetchedListRow ??
    resolveStoreCartSheetPrefetchedRow(
      productId,
      opts.editCartLine,
      opts.menusRowsById ?? {}
    );

  const commerce = resolveStoreFrontCommerceState(opts.store.business_hours_json, opts.store.is_open);
  const blocked = !commerce.isOpenForCommerce;
  const hint = blocked
    ? commerce.inBreak
      ? `준비중 · Break time: ${commerce.breakRangeLabel}. 쉬는 시간에는 메뉴를 선택할 수 없습니다.`
      : "지금은 영업 시간이 아니어서 메뉴를 선택할 수 없습니다."
    : undefined;

  openStoreProductSheet({
    productId,
    pageStoreSlug: opts.store.slug,
    prefetchedListRow,
    sheetStoreContext: {
      store: storeCartHeadToDetailLike(opts.store),
      favoriteCount: 0,
      recentOrderCount: 0,
    },
    commerceBlocked: blocked,
    commerceBlockedHint: hint,
    editCartLine: opts.editCartLine ?? null,
  });
}
