import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

/** 구매자만 평가·후기 UI 오픈 — 거래완료 확인 후·미작성·분쟁 아님 (채팅·구매내역 공통) */
export function canOpenTradeReviewSheet(opts: {
  currentUserId: string;
  roomSellerId: string;
  roomBuyerId: string;
  productStatus?: string;
  sellerListingState?: string;
  /** 채팅 상세: 판매자가 목록 상태를 로컬 고정한 경우 */
  sellerListingOverride?: SellerListingState | null;
  tradeFlowStatus?: string | null;
  soldBuyerId?: string | null;
  /** API/room 조회로 채워짐 — 이미 후기 제출 시 false */
  buyerReviewSubmitted?: boolean;
}): boolean {
  const productStatus = opts.productStatus ?? "";
  const soldToOther =
    productStatus === "sold" &&
    !!opts.soldBuyerId &&
    opts.roomBuyerId === opts.currentUserId &&
    opts.soldBuyerId !== opts.currentUserId;
  if (soldToOther) return false;

  if (opts.currentUserId !== opts.roomBuyerId) return false;

  const propListing = normalizeSellerListingState(
    opts.sellerListingState,
    productStatus
  );
  const displayListing =
    opts.sellerListingOverride != null
      ? opts.sellerListingOverride
      : propListing;
  const isSold = productStatus === "sold" || displayListing === "completed";

  if (opts.buyerReviewSubmitted === true) return false;

  const flow = String(opts.tradeFlowStatus ?? "chatting");
  return (
    isSold &&
    flow !== "dispute" &&
    flow !== "chatting" &&
    flow !== "seller_marked_done" &&
    flow !== "archived" &&
    flow !== "cancelled" &&
    flow !== "review_completed" &&
    (flow === "buyer_confirmed" || flow === "review_pending")
  );
}
