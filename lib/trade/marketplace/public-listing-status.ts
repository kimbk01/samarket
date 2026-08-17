/**
 * Marketplace public listing status — ACTIVE | SOLD only.
 * L1 inquiry/negotiating/reserved stay internal; do not paint 문의중/예약중 on LIST/SEARCH/DETAIL.
 * Chat activity (trade_flow_status, reserved_buyer_id) is out of this module.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import {
  APP_FEED_LIST_ROW1_LAYOUT,
  APP_FEED_LIST_ROW1_TEXT_DETAIL,
  APP_FEED_LIST_ROW1_TEXT_LIST,
} from "@/lib/ui/app-feed-list-row1";

export type MarketplacePublicListingStatus = "active" | "sold";

export type MarketplacePublicTradeState = "latest" | "active" | "sold";

export type MarketplacePublicListingPost = {
  seller_listing_state?: unknown;
  status?: string | null;
};

/** Legacy URL `tradeState=reserved` → public active. Do not filter L1 reserved as its own marketplace facet. */
export function parseMarketplacePublicTradeState(
  raw: string | null | undefined
): MarketplacePublicTradeState {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "sold") return "sold";
  if (s === "active" || s === "reserved") return "active";
  return "latest";
}

/**
 * sold wins. completed → sold. inquiry/negotiating/reserved → active.
 * hidden/deleted are not public marketplace values (feed already excludes them).
 */
export function resolveMarketplacePublicListingStatus(
  post: MarketplacePublicListingPost
): MarketplacePublicListingStatus {
  const st = String(post.status ?? "").trim().toLowerCase();
  if (st === "sold") return "sold";
  const ls = normalizeSellerListingState(post.seller_listing_state, st);
  if (ls === "completed") return "sold";
  return "active";
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function marketplacePublicStatusLabel(
  status: MarketplacePublicListingStatus,
  t?: Translate
): string {
  if (status === "sold") {
    return t ? t("trade_listing_step_completed") : "판매완료";
  }
  return t ? t("trade_listing_step_inquiry") : "판매중";
}

export function marketplacePublicStatusBadge(
  post: MarketplacePublicListingPost,
  size: "list" | "detail" = "list",
  t?: Translate
): { label: string; className: string } {
  const st = String(post.status ?? "active").toLowerCase();
  const textSz = size === "detail" ? APP_FEED_LIST_ROW1_TEXT_DETAIL : APP_FEED_LIST_ROW1_TEXT_LIST;
  const row1 = `${APP_FEED_LIST_ROW1_LAYOUT} ${textSz}`.trim();

  if (st === "hidden" || st === "blinded" || st === "deleted") {
    const label = st === "deleted" ? "삭제됨" : "숨김";
    return {
      label,
      className: `${row1} border border-gray-300 bg-gray-100 text-gray-600`,
    };
  }

  const publicStatus = resolveMarketplacePublicListingStatus(post);
  const label = marketplacePublicStatusLabel(publicStatus, t);
  if (publicStatus === "sold") {
    return {
      label,
      className: `${row1} border border-gray-300 bg-gray-100 text-gray-600`,
    };
  }
  return {
    label,
    className: `${row1} border-0 bg-signature text-white`,
  };
}
