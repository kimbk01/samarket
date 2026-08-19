import type { SellerListingState } from "@/lib/products/seller-listing-state";
import {
  isTradeReviewWriteEligible,
  type TradeReviewEligibilityInput,
} from "@/lib/trade/trade-review-eligibility";

/**
 * CUT 3 — Trade Chat buyer review write sheet gate.
 * submit-review API remains server authority.
 */
export function canOpenTradeReviewSheet(opts: {
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
  const input: TradeReviewEligibilityInput = {
    currentUserId: opts.currentUserId,
    roomBuyerId: opts.roomBuyerId,
    roomSellerId: opts.roomSellerId,
    productStatus: opts.productStatus,
    soldBuyerId: opts.soldBuyerId,
    tradeFlowStatus: opts.tradeFlowStatus,
    buyerReviewSubmitted: opts.buyerReviewSubmitted,
  };
  return isTradeReviewWriteEligible(input);
}
