import { normalizeSellerListingState, publicListingBadge } from "@/lib/products/seller-listing-state";
import { tradeSituationShortLabel } from "@/lib/trade/trade-situation-copy";

export function salesTradeStatusBadge(flow: string): string {
  const f = String(flow ?? "chatting");
  if (f === "dispute") return "분쟁 처리중";
  if (f === "archived") return "종료";
  if (f === "review_completed") return "거래·후기 완료";
  if (f === "seller_marked_done") return "구매자 확인 대기";
  if (f === "buyer_confirmed" || f === "review_pending") return "거래완료 확인 · 평가·후기";
  return "판매중";
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
  tradeFlowStatus: string | undefined,
  hasBuyerReview: boolean,
  buyerConfirmSource?: string | null
): string {
  return tradeSituationShortLabel(tradeFlowStatus, "seller", {
    hasBuyerReview,
    buyerConfirmSource,
  });
}
