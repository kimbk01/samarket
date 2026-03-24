import { normalizeSellerListingState, publicListingBadge } from "@/lib/products/seller-listing-state";

/** 구매내역 카드 ⋮ 메뉴 분기 (당근형) */
export type PurchaseOverflowMenuKind = "trading" | "seller_done" | "need_review" | "review_done" | "dispute" | "archived";

export interface PurchaseRowLike {
  tradeFlowStatus?: string | null;
  hasBuyerReview: boolean;
  buyerConfirmSource?: string | null;
}

export function purchaseOverflowMenuKind(row: PurchaseRowLike): PurchaseOverflowMenuKind {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  if (flow === "dispute") return "dispute";
  if (flow === "archived") return "archived";
  if (flow === "seller_marked_done") return "seller_done";
  if (row.hasBuyerReview || flow === "review_completed") return "review_done";
  if (flow === "buyer_confirmed" || flow === "review_pending") return "need_review";
  return "trading";
}

/** 거래 상태 배지 (카드 상단용) */
export function purchaseTradeStatusBadge(row: PurchaseRowLike): string {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  if (flow === "dispute") return "분쟁 처리중";
  if (flow === "archived") return "종료";
  if (flow === "seller_marked_done") return "판매자가 거래완료 처리함";
  if (flow === "buyer_confirmed" || flow === "review_pending") {
    const src = String(row.buyerConfirmSource ?? "");
    if (src === "admin") return "관리자완료(거래완료 확인)";
    if (src === "system") return "자동 거래완료 확인됨";
    return "거래완료 확인됨";
  }
  if (flow === "review_completed") return "거래·후기 완료";
  return "판매중";
}

/** 상품(노출) 상태 — 판매내역 카드의 「상품 · …」와 동일 소스(DB seller_listing_state·status) */
export function purchaseProductStatusBadge(sellerListingState: unknown, postStatus: string | undefined): string {
  const ls = normalizeSellerListingState(sellerListingState, postStatus);
  return publicListingBadge(ls, postStatus).label;
}

/** 후기 상태 배지 */
export function purchaseReviewStatusBadge(row: PurchaseRowLike): string {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  if (flow === "dispute") return "보류";
  if (flow === "archived") return "—";
  if (flow === "seller_marked_done") return "거래완료 확인 대기";
  if (row.hasBuyerReview || flow === "review_completed") return "평가·후기 완료";
  if (flow === "buyer_confirmed" || flow === "review_pending") return "평가·후기 작성 가능";
  return "—";
}

/** 구매내역 ⋮ 「후기 보내기」 — 거래완료 확인(buyer_confirmed | review_pending) 후·미작성·분쟁 아님 */
export function canShowPurchaseReviewSend(row: PurchaseRowLike): boolean {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  if (flow === "dispute" || row.hasBuyerReview) return false;
  return flow === "buyer_confirmed" || flow === "review_pending";
}
