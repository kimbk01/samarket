/**
 * Trade list viewer role — identity SSOT (seller vs counterparty/buyer).
 * Never invent buyer when role cannot be proven.
 */
export type TradeViewerRole = "seller" | "buyer";

export function resolveTradeViewerRole(input: {
  viewerUserId: string;
  sellerUserId?: string | null;
  counterpartyUserId?: string | null;
  /** Aliases accepted for call-site clarity */
  sellerId?: string | null;
  buyerId?: string | null;
}): TradeViewerRole | null {
  const viewer = input.viewerUserId.trim();
  const seller = (input.sellerUserId ?? input.sellerId ?? "").trim();
  const buyer = (input.counterpartyUserId ?? input.buyerId ?? "").trim();
  if (!viewer || !seller || !buyer) return null;
  if (viewer === seller) return "seller";
  if (viewer === buyer) return "buyer";
  return null;
}

export function tradeViewerRoleLabelKo(role: TradeViewerRole): string {
  return role === "seller" ? "판매" : "구매";
}

export function tradeViewerRoleLabelEn(role: TradeViewerRole): string {
  return role === "seller" ? "Selling" : "Buying";
}
