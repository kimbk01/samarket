/**
 * 당근형 사용자용 거래·상품 상태 문구 (기술적 enum 노출 최소화)
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { TradeReviewTranslate } from "@/lib/trade/trade-review-tags";

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
  t: TradeReviewTranslate,
  flowRaw: string | undefined | null,
  perspective: "seller" | "buyer",
  opts?: { hasBuyerReview?: boolean; buyerConfirmSource?: string | null }
): string {
  const flow = normalizeTradeFlowKey(flowRaw);
  const hasRev = opts?.hasBuyerReview === true;
  if (flow === "dispute") return t("trade_situation_dispute");
  if (flow === "archived") return t("trade_situation_archived");
  if (flow === "review_completed") {
    return perspective === "seller"
      ? t("trade_situation_review_done_seller")
      : t("trade_situation_review_done_buyer");
  }
  if (perspective === "buyer" && hasRev) return t("trade_situation_review_done_buyer");
  if (perspective === "seller" && hasRev && (flow === "buyer_confirmed" || flow === "review_pending")) {
    return t("trade_situation_seller_review_arrived");
  }
  if (flow === "buyer_confirmed" || flow === "review_pending") {
    const src = String(opts?.buyerConfirmSource ?? "");
    if (perspective === "seller") {
      if (src === "admin") return t("trade_situation_seller_confirm_admin");
      if (src === "system") return t("trade_situation_seller_confirm_system");
      return t("trade_situation_seller_confirm_default");
    }
    if (src === "admin") return t("trade_situation_buyer_confirm_admin");
    if (src === "system") return t("trade_situation_buyer_confirm_system");
    return t("trade_situation_buyer_confirm_default");
  }
  if (flow === "seller_marked_done") {
    return perspective === "seller"
      ? t("trade_situation_seller_marked_seller")
      : t("trade_situation_seller_marked_buyer");
  }
  return t("trade_situation_selling");
}
