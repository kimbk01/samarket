import type { SheetPublicProduct } from "@/lib/stores/map-list-row-to-sheet-product";

/** 할인 반영 단가(옵션 델타 전) */
export function calculateStoreProductBaseUnit(product: Pick<SheetPublicProduct, "price" | "discount_price">): number {
  return product.discount_price != null &&
    Number.isFinite(product.discount_price) &&
    product.discount_price >= 0 &&
    product.discount_price < product.price
    ? product.discount_price
    : product.price;
}
