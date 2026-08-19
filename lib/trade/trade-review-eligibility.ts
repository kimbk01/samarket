/**
 * CUT 3 — Marketplace buyer review write eligibility (UI gate only).
 * Server authority: POST .../submit-review
 */
export type TradeReviewEligibilityInput = {
  currentUserId: string;
  roomBuyerId: string;
  roomSellerId: string;
  productStatus?: string | null;
  soldBuyerId?: string | null;
  tradeFlowStatus?: string | null;
  buyerReviewSubmitted?: boolean;
};

function trimId(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Buyer may open trade review write UI in Trade Chat. */
export function isTradeReviewWriteEligible(opts: TradeReviewEligibilityInput): boolean {
  const userId = trimId(opts.currentUserId);
  const buyerId = trimId(opts.roomBuyerId);
  if (!userId || userId !== buyerId) return false;

  if (opts.buyerReviewSubmitted === true) return false;

  const flow = String(opts.tradeFlowStatus ?? "chatting");
  if (flow === "dispute" || flow === "archived" || flow === "cancelled") return false;
  if (flow !== "buyer_confirmed" && flow !== "review_pending") return false;

  if (String(opts.productStatus ?? "").trim().toLowerCase() !== "sold") return false;

  const soldBuyerId = trimId(opts.soldBuyerId);
  if (!soldBuyerId || soldBuyerId !== userId) return false;

  return true;
}
