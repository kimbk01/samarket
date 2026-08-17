import type { SellerListingState } from "@/lib/products/seller-listing-state";

/**
 * CUT D — Marketplace member review write UI is removed.
 * submit-review API and historical review data remain; this gate stays false for product UI.
 */
export function canOpenTradeReviewSheet(_opts: {
  currentUserId: string;
  roomSellerId: string;
  roomBuyerId: string;
  productStatus?: string;
  sellerListingState?: string;
  sellerListingOverride?: SellerListingState | null;
  tradeFlowStatus?: string | null;
  soldBuyerId?: string | null;
  buyerReviewSubmitted?: boolean;
}): boolean {
  return false;
}
