import { normalizeSellerListingState, publicListingBadge } from "@/lib/products/seller-listing-state";

/** 구매내역 카드 ⋮ 메뉴 분기 (CUT D: 후기 작성 경로 제거) */
export type PurchaseOverflowMenuKind = "trading" | "seller_done" | "review_done" | "dispute" | "archived";

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
  if (flow === "buyer_confirmed" || flow === "review_pending") return "review_done";
  return "trading";
}

/** 거래 상태 배지 (카드 상단용) */
export function purchaseTradeStatusBadge(row: PurchaseRowLike): string {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  if (flow === "dispute") return "분쟁 처리중";
  if (flow === "archived") return "종료";
  if (flow === "seller_marked_done") return "판매자가 거래완료 처리함";
  if (flow === "buyer_confirmed" || flow === "review_pending" || flow === "review_completed") {
    const src = String(row.buyerConfirmSource ?? "");
    if (src === "admin") return "관리자완료(거래완료 확인)";
    if (src === "system") return "자동 거래완료 확인됨";
    return "거래완료";
  }
  return "판매중";
}

/** 상품(노출) 상태 — 판매내역 카드의 「상품 · …」와 동일 소스(DB seller_listing_state·status) */
export function purchaseProductStatusBadge(sellerListingState: unknown, postStatus: string | undefined): string {
  const ls = normalizeSellerListingState(sellerListingState, postStatus);
  return publicListingBadge(ls, postStatus).label;
}

/** 후기 상태 배지 — 과거 작성분만 표시, 대기/작성 유도 없음 */
export function purchaseReviewStatusBadge(row: PurchaseRowLike): string | null {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  if (flow === "dispute" || flow === "archived") return null;
  if (row.hasBuyerReview || flow === "review_completed") return "평가·후기 기록 있음";
  return null;
}

/** CUT D — Marketplace member review write CTA disabled */
export function canShowPurchaseReviewSend(_row: PurchaseRowLike): boolean {
  return false;
}
