/**
 * TRADE room Marketplace chrome (R5 TRADE-ONLY).
 * Header / banner / timeline origin — not composer, not general/group/order.
 * Lives here so Phase2 presentation does not import lib/messenger (Phase 4.5 wiring 0).
 */
export function formatTradeMarketplacePeerProductTitle(
  peerLabel: string | null | undefined,
  productTitle: string | null | undefined
): string {
  const peer = peerLabel?.trim() || "";
  const product = productTitle?.trim() || "";
  if (peer && product) return `${peer} · ${product}`;
  return product || peer;
}

/** Counterparty role on this listing — never the viewer's own role. */
export function resolveTradeWindowCounterpartyRole(input: {
  viewerUserId?: string | null;
  sellerUserId?: string | null;
  buyerUserId?: string | null;
}): "seller" | "buyer" | null {
  const viewer = input.viewerUserId?.trim() || "";
  const seller = input.sellerUserId?.trim() || "";
  const buyer = input.buyerUserId?.trim() || "";
  if (!viewer) return null;
  if (seller && viewer === seller) return "buyer";
  if (buyer && viewer === buyer) return "seller";
  if (seller && viewer !== seller) return "seller";
  return null;
}
