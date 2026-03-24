/**
 * 당근형 사용자용 거래·상품 상태 문구 (기술적 enum 노출 최소화)
 */

export type TradeFlowKey =
  | "chatting"
  | "seller_marked_done"
  | "buyer_confirmed"
  | "review_pending"
  | "review_completed"
  | "dispute"
  | "archived";

export function normalizeTradeFlowKey(raw: string | undefined | null): TradeFlowKey {
  const s = String(raw ?? "chatting").trim();
  if (
    s === "seller_marked_done" ||
    s === "buyer_confirmed" ||
    s === "review_pending" ||
    s === "review_completed" ||
    s === "dispute" ||
    s === "archived"
  ) {
    return s;
  }
  return "chatting";
}

/** 채팅 상단·카드용 짧은 거래 진행 문구 */
export function tradeSituationShortLabel(
  flowRaw: string | undefined | null,
  perspective: "seller" | "buyer",
  opts?: { hasBuyerReview?: boolean; buyerConfirmSource?: string | null }
): string {
  const flow = normalizeTradeFlowKey(flowRaw);
  const hasRev = opts?.hasBuyerReview === true;
  if (flow === "dispute") return "분쟁 처리 중";
  if (flow === "archived") return "종료된 거래";
  if (flow === "review_completed") {
    return perspective === "seller" ? "거래·후기 완료" : "후기 작성 완료";
  }
  if (perspective === "buyer" && hasRev) return "후기 작성 완료";
  if (perspective === "seller" && hasRev && (flow === "buyer_confirmed" || flow === "review_pending")) {
    return "구매자 후기 도착";
  }
  if (flow === "buyer_confirmed" || flow === "review_pending") {
    const src = String(opts?.buyerConfirmSource ?? "");
    if (perspective === "seller") {
      if (src === "admin") return "관리자 처리 확인 · 평가·후기 대기";
      if (src === "system") return "자동 확인 · 평가·후기 대기";
      return "구매자 거래완료 확인 · 평가·후기 대기";
    }
    if (src === "admin") return "관리자완료(거래완료 확인)";
    if (src === "system") return "자동 거래완료 확인됨";
    return "거래완료 확인됨";
  }
  if (flow === "seller_marked_done") {
    return perspective === "seller" ? "구매자 확인 대기" : "판매자가 거래완료 처리함";
  }
  return "판매중";
}
