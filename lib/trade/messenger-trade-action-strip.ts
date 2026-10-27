import { canOpenTradeReviewSheet } from "@/lib/trade/can-open-trade-review-sheet";

/**
 * 메신저 거래 방 헤더 아래 「거래 행동 줄」 노출 판정 (2026-10-27 PR-01).
 * 2026-08-20 하단 거래 dock 제거 이후 거래완료 확인·후기·판매자 단계 변경 진입이 사라졌다 —
 * 할 일이 있을 때만 `TradeFlowBanner` 를 한 줄(접힘)로 노출하고, 없으면 렌더하지 않는다.
 */
export type MessengerTradeActionStripKind =
  | "seller_listing"
  | "buyer_confirm"
  | "review"
  | "notice"
  | null;

export function resolveMessengerTradeActionStripKind(input: {
  viewerUserId: string;
  sellerId: string;
  buyerId: string;
  hasProduct: boolean;
  productStatus: string;
  tradeFlowStatus: string | null | undefined;
  soldBuyerId?: string | null;
  buyerReviewSubmitted?: boolean;
}): MessengerTradeActionStripKind {
  const viewer = input.viewerUserId.trim();
  if (!viewer) return null;
  const amSeller = input.sellerId === viewer;
  const amBuyer = input.buyerId === viewer;
  const flow = (input.tradeFlowStatus ?? "chatting").trim() || "chatting";
  const productStatus = input.productStatus.trim().toLowerCase();

  if (flow === "dispute" || flow === "archived") return "notice";
  if (amBuyer && productStatus === "sold" && input.soldBuyerId && input.soldBuyerId !== viewer) {
    return "notice";
  }
  if (amSeller && input.hasProduct && productStatus !== "sold" && flow === "chatting") {
    return "seller_listing";
  }
  if (amBuyer && flow === "seller_marked_done") return "buyer_confirm";
  if (
    canOpenTradeReviewSheet({
      currentUserId: viewer,
      roomSellerId: input.sellerId,
      roomBuyerId: input.buyerId,
      productStatus,
      tradeFlowStatus: flow,
      soldBuyerId: input.soldBuyerId,
      buyerReviewSubmitted: input.buyerReviewSubmitted,
    })
  ) {
    return "review";
  }
  return null;
}
