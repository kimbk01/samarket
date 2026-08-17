import type { MessageKey } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

/**
 * /mypage/trade/sales list tabs — chat/flow buckets, not Marketplace ACTIVE/SOLD.
 * reserved / review_wait are activity 모아보기, not 1st-class tabs.
 */
export type SellerManageTabId = "selling" | "completed" | "cancelled";

export const SELLER_MANAGE_TABS: { id: SellerManageTabId; label: string; labelKey: MessageKey }[] = [
  { id: "selling", label: "판매중", labelKey: "tab_active_sale" },
  { id: "completed", label: "판매완료", labelKey: "tab_sale_completed" },
  { id: "cancelled", label: "판매취소", labelKey: "tab_sale_cancelled" },
];

type Row = Pick<
  SalesHistoryRow,
  | "tradeFlowStatus"
  | "status"
  | "sellerListingState"
  | "hasBuyerReview"
  | "noActiveChat"
  | "chatId"
>;

export function parseSellerManageTabId(raw: string | null | undefined): SellerManageTabId {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "completed" || s === "review_wait") return "completed";
  if (s === "cancelled") return "cancelled";
  return "selling";
}

function hasActiveChat(row: Row): boolean {
  return Boolean(row.chatId?.trim()) && !row.noActiveChat;
}

/** Review hub entry — not a sales list tab. */
export function isSellerReviewWait(row: Row): boolean {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  const st = String(row.status ?? "active").toLowerCase();
  if (flow === "archived" || flow === "cancelled" || st === "deleted") return false;
  const soldLike = st === "sold";
  return (
    hasActiveChat(row) &&
    soldLike &&
    (flow === "buyer_confirmed" || flow === "review_pending") &&
    !row.hasBuyerReview
  );
}

export function getSellerManageTabId(row: Row): SellerManageTabId {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  const st = String(row.status ?? "active").toLowerCase();

  if (flow === "archived") return "cancelled";
  if (flow === "cancelled") return "cancelled";
  if (st === "deleted") return "cancelled";

  const listing = normalizeSellerListingState(row.sellerListingState, row.status);
  if (st === "reserved" || listing === "reserved") return "selling";

  const soldLike = st === "sold";
  if (isSellerReviewWait(row)) return "completed";

  if (flow === "review_completed" || (row.hasBuyerReview && soldLike)) return "completed";
  if (soldLike && flow !== "cancelled" && flow !== "archived") {
    if (flow === "dispute") return "selling";
    return "completed";
  }

  return "selling";
}

export function countSellerManageTabs<T extends Row>(items: T[]): Record<SellerManageTabId, number> {
  const counts: Record<SellerManageTabId, number> = {
    selling: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of items) {
    counts[getSellerManageTabId(row)] += 1;
  }
  return counts;
}

export function getSellerManageTabLabel(
  id: SellerManageTabId,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const tab = SELLER_MANAGE_TABS.find((item) => item.id === id);
  return tab ? translate(language, tab.labelKey) : id;
}
