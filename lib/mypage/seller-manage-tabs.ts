import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

/** 내정보 거래관리 — 판매내역 하위 탭 */
export type SellerManageTabId =
  | "selling"
  | "reserved"
  | "completed"
  | "cancelled"
  | "review_wait";

export const SELLER_MANAGE_TABS: { id: SellerManageTabId; label: string }[] = [
  { id: "selling", label: "판매중" },
  { id: "reserved", label: "예약중" },
  { id: "completed", label: "판매완료" },
  { id: "cancelled", label: "판매취소" },
  { id: "review_wait", label: "후기대기" },
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

export function getSellerManageTabId(row: Row): SellerManageTabId {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  const st = String(row.status ?? "active").toLowerCase();

  if (flow === "archived") return "cancelled";
  if (flow === "cancelled") return "cancelled";
  if (st === "deleted") return "cancelled";

  const listing = normalizeSellerListingState(row.sellerListingState, row.status);
  if (st === "reserved" || listing === "reserved") return "reserved";

  const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;
  const soldLike = st === "sold";
  const waitingBuyerReview =
    hasChat &&
    soldLike &&
    (flow === "buyer_confirmed" || flow === "review_pending") &&
    !row.hasBuyerReview;
  if (waitingBuyerReview) return "review_wait";

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
    reserved: 0,
    completed: 0,
    cancelled: 0,
    review_wait: 0,
  };
  for (const row of items) {
    counts[getSellerManageTabId(row)] += 1;
  }
  return counts;
}
