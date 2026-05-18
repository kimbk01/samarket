import type { MessageKey } from "@/lib/i18n/messages";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import type { ProductStatus } from "@/lib/types/product";

export const SELLER_LISTING_LABEL_KEYS: Record<SellerListingState, MessageKey> = {
  inquiry: "mypage_comp_listing_inquiry",
  negotiating: "mypage_comp_listing_negotiating",
  reserved: "mypage_comp_listing_reserved",
  completed: "mypage_comp_listing_completed",
};

export function sellerListingLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  state: SellerListingState
): string {
  return t(SELLER_LISTING_LABEL_KEYS[state]);
}

const PRODUCT_STATUS_LABEL_KEYS: Partial<Record<ProductStatus, MessageKey>> = {
  active: "mypage_comp_product_status_active",
  reserved: "mypage_comp_product_status_reserved",
  sold: "mypage_comp_product_status_sold",
  hidden: "mypage_comp_product_status_hidden",
};

export function productStatusLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  status: ProductStatus
): string {
  const key = PRODUCT_STATUS_LABEL_KEYS[status];
  return key ? t(key) : status;
}
