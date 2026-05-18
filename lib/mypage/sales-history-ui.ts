import { normalizeSellerListingState, publicListingBadge } from "@/lib/products/seller-listing-state";
import { tradeSituationShortLabel } from "@/lib/trade/trade-situation-copy";
import type { TradeReviewTranslate } from "@/lib/trade/trade-review-tags";

export function salesTradeStatusBadge(t: TradeReviewTranslate, flow: string): string {
  const f = String(flow ?? "chatting");
  if (f === "dispute") return t("trade_sales_badge_dispute");
  if (f === "archived") return t("trade_sales_badge_archived");
  if (f === "review_completed") return t("trade_sales_badge_review_done");
  if (f === "seller_marked_done") return t("trade_sales_badge_seller_marked");
  if (f === "buyer_confirmed" || f === "review_pending") return t("trade_sales_badge_buyer_confirmed");
  return t("trade_sales_badge_selling");
}

/** 상품(노출) 상태 배지 — 판매내역 카드 */
export function salesProductStatusBadge(sellerListingState: unknown, postStatus: string | undefined): string {
  const ls = normalizeSellerListingState(sellerListingState, postStatus);
  return publicListingBadge(ls, postStatus).label;
}

/** ⋮ 메뉴용 판매자 액션 가능 여부 */
export function salesCanSellerCompleteTrade(
  tradeFlowStatus: string | undefined,
  postStatus: string | undefined
): boolean {
  const st = (postStatus ?? "").toLowerCase();
  if (st === "sold") return false;
  const f = String(tradeFlowStatus ?? "chatting");
  return f === "chatting" || f === "";
}

export function salesCanChangeListing(postStatus: string | undefined): boolean {
  return (postStatus ?? "").toLowerCase() !== "sold";
}

export function salesCardTradeLine(
  t: TradeReviewTranslate,
  tradeFlowStatus: string | undefined,
  hasBuyerReview: boolean,
  buyerConfirmSource?: string | null
): string {
  return tradeSituationShortLabel(t, tradeFlowStatus, "seller", {
    hasBuyerReview,
    buyerConfirmSource,
  });
}
