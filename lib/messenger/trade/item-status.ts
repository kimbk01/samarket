/**
 * Trade list item status badge — posts.seller_listing_state / status SSOT.
 * Never derive from last-message preview text.
 */
import {
  normalizeSellerListingState,
  publicListingBadge,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";

export type TradeItemStatus = "available" | "reserved" | "sold" | "hidden" | "deleted";

export function resolveTradeItemStatus(input: {
  sellerListingStateRaw?: unknown;
  postStatus?: string | null;
}): { itemStatus: TradeItemStatus; statusBadgeLabel: string; listingState: SellerListingState } {
  const postStatus = (input.postStatus ?? "").trim().toLowerCase();
  if (postStatus === "deleted") {
    return { itemStatus: "deleted", statusBadgeLabel: "삭제된 상품", listingState: "completed" };
  }
  if (postStatus === "hidden" || postStatus === "blinded") {
    return { itemStatus: "hidden", statusBadgeLabel: "숨김", listingState: "inquiry" };
  }
  if (postStatus === "sold") {
    return { itemStatus: "sold", statusBadgeLabel: "거래완료", listingState: "completed" };
  }
  const listingState = normalizeSellerListingState(input.sellerListingStateRaw, postStatus);
  const badge = publicListingBadge(listingState, postStatus || "active");
  let itemStatus: TradeItemStatus = "available";
  if (listingState === "reserved") itemStatus = "reserved";
  if (listingState === "completed") itemStatus = "sold";
  return {
    itemStatus,
    statusBadgeLabel: badge.label,
    listingState,
  };
}

/** Status-change system copy that must not duplicate the badge on line 3. */
export function looksLikeTradeStatusChangePreview(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /상태가\s*(판매중|예약중|거래완료|문의중)/.test(t) ||
    /제품의\s*상태가/.test(t) ||
    /listing\s*status/i.test(t) ||
    /changed.*(reserved|sold|available)/i.test(t)
  );
}

export function normalizeTradeListPreviewLine(input: {
  previewText: string;
  isSystem: boolean;
  statusBadgeLabel: string | null;
}): { text: string; isSystemEvent: boolean } {
  const text = input.previewText.trim();
  const isStatusCopy = looksLikeTradeStatusChangePreview(text);
  const isSystemEvent = input.isSystem || isStatusCopy;
  if (isStatusCopy && input.statusBadgeLabel) {
    return {
      text: `상태 변경 · ${input.statusBadgeLabel}`,
      isSystemEvent: true,
    };
  }
  return { text: text || "메시지가 없습니다", isSystemEvent };
}
