/**
 * AD-P0-4 — Finance ↔ Ad bidirectional deep-links (no fake amounts).
 * Finance list/detail destinations own to `lib/finance/routes.ts`.
 */

import {
  financeOrderHref,
  financeTransactionDetailHref,
  financeTransactionListHref,
  ownerFinanceSectionHref,
  type FinanceWalletParam,
} from "@/lib/finance/routes";


export type FinanceAdFamily =
  | "delivery_campaign"
  | "feed_request"
  | "feed_campaign"
  | "boost_order"
  | "platform_popup_campaign"
  | "platform_popup_owner_request"
  | "trade_post_ad_legacy"
  | "partner";

export function adminAdDetailHref(input: {
  family: FinanceAdFamily;
  id: string;
}): string | null {
  const id = input.id.trim();
  if (!id) return null;
  switch (input.family) {
    case "delivery_campaign":
      return `/admin/delivery-ads/${encodeURIComponent(id)}`;
    case "feed_request":
      return `/admin/feed-ad-requests/${encodeURIComponent(id)}`;
    case "feed_campaign":
      return `/admin/feed-ads?campaignId=${encodeURIComponent(id)}`;
    case "boost_order":
      return `/admin/promoted-items?orderId=${encodeURIComponent(id)}`;
    case "platform_popup_campaign":
      return `/admin/platform-popup/${encodeURIComponent(id)}`;
    case "platform_popup_owner_request":
      return `/admin/platform-popup/requests/${encodeURIComponent(id)}`;
    case "trade_post_ad_legacy":
      return `/admin/trade-post-ads?id=${encodeURIComponent(id)}`;
    case "partner":
      return `/admin/delivery-ads/partner?id=${encodeURIComponent(id)}`;
    default:
      return null;
  }
}

function toWalletParam(wallet?: "point" | "coin" | "cash" | null): FinanceWalletParam | null {
  if (!wallet) return null;
  const u = wallet.toUpperCase();
  if (u === "POINT" || u === "COIN" || u === "CASH") return u;
  return null;
}

export function adminFinanceLedgerHref(input: {
  wallet?: "point" | "coin" | "cash";
  ledgerId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
  adId?: string | null;
}): string {
  const filters = {
    wallet: toWalletParam(input.wallet),
    storeId: input.storeId ?? null,
    orderId: input.orderId ?? null,
    adId: input.adId ?? null,
  };
  const ledgerId = input.ledgerId?.trim();
  if (ledgerId) return financeTransactionDetailHref(ledgerId, filters);
  return financeTransactionListHref(filters);
}

export function ownerFinanceLedgerHref(input: {
  storeId: string;
  wallet?: "coin" | "cash";
  ledgerId?: string | null;
  orderId?: string | null;
  adId?: string | null;
}): string {
  const section = input.wallet === "cash" ? "cash" : "coin";
  return ownerFinanceSectionHref(input.storeId, section, {
    orderId: input.orderId ?? null,
    adId: input.adId ?? null,
    txId: input.ledgerId ?? null,
  });
}

export function ownerOrderFinanceHref(storeId: string, orderId: string): string {
  return `/stores/owner/orders/${encodeURIComponent(orderId)}?storeId=${encodeURIComponent(storeId)}&focus=finance`;
}

export function adminOrderFinanceHref(orderId: string, storeId?: string | null): string {
  return financeOrderHref(orderId, { storeId: storeId ?? null });
}

/** Map cash ledger related_type → ad family for deep-link. */
export function resolveAdFamilyFromCashRelated(
  relatedType: string,
  productKind?: string | null
): FinanceAdFamily | null {
  const t = String(relatedType ?? "").trim().toLowerCase();
  const kind = String(productKind ?? "").trim().toLowerCase();
  if (kind === "partner" || t.includes("partner")) return "partner";
  if (kind === "platform_popup" || t.includes("platform_popup")) {
    return t.includes("owner_request")
      ? "platform_popup_owner_request"
      : "platform_popup_campaign";
  }
  if (
    t.includes("delivery_ad") ||
    t.includes("store_paid_ad") ||
    t.includes("store_banner") ||
    t.includes("store_sponsored") ||
    kind === "store_sponsored" ||
    kind === "banner"
  ) {
    return "delivery_campaign";
  }
  return null;
}

export function resolveAdFamilyFromPointSource(source: string): FinanceAdFamily | null {
  const s = String(source ?? "").trim().toLowerCase();
  if (s.includes("feed_ad")) return "feed_request";
  if (s.includes("promotion") || s.includes("boost")) return "boost_order";
  if (s.includes("trade_post_ad") || s.includes("trade_ad")) return "trade_post_ad_legacy";
  return null;
}
