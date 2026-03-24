import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

export type PurchaseListTabId = "all" | "completed" | "inquiry" | "trading";

export const PURCHASE_LIST_TABS: { id: PurchaseListTabId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "completed", label: "거래완료" },
  { id: "inquiry", label: "문의중" },
  { id: "trading", label: "판매중" },
];

export type PurchaseRowForTab = {
  tradeFlowStatus?: string | null;
  status?: string | null;
  soldBuyerId?: string | null;
  sellerListingState?: string | null;
};

/**
 * 구매내역 탭 분류 — product_chats.trade_flow_status·posts 를 기준으로 판매내역과 동일 시계열
 * - 거래완료(탭): 평가·후기까지 끝(review_completed) 또는 구매자 거래완료 확인 이후(buyer_confirmed·review_pending) + 이 구매자에게 판매됨.
 *   ※ 판매자만 거래완료 처리(seller_marked_done)한 단계는 글이 sold여도 구매자 확인 전이므로 판매중 탭.
 * - 문의중: 채팅만 이어지는 초기 단계(판매글 미완료·inquiry/negotiating).
 * - 판매중: 그 외(거래완료 확인 대기·평가·후기 작성 전·분쟁 등).
 */
export function getPurchaseListTabId(row: PurchaseRowForTab, buyerUserId: string): PurchaseListTabId {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  const status = String(row.status ?? "active").toLowerCase();
  const soldToMe = status === "sold" && row.soldBuyerId && row.soldBuyerId === buyerUserId;

  if (flow === "dispute") {
    return "trading";
  }

  if (flow === "review_completed") {
    return "completed";
  }

  if (soldToMe && (flow === "buyer_confirmed" || flow === "review_pending")) {
    return "completed";
  }

  const listing = normalizeSellerListingState(row.sellerListingState, row.status ?? undefined);
  const earlyInquiry =
    flow === "chatting" &&
    status !== "sold" &&
    (listing === "inquiry" || listing === "negotiating");

  if (earlyInquiry) {
    return "inquiry";
  }

  return "trading";
}

export function countPurchasesByTab<T extends PurchaseRowForTab>(items: T[], buyerUserId: string): Record<PurchaseListTabId, number> {
  const counts: Record<PurchaseListTabId, number> = {
    all: items.length,
    completed: 0,
    inquiry: 0,
    trading: 0,
  };
  for (const row of items) {
    const t = getPurchaseListTabId(row, buyerUserId);
    counts[t] += 1;
  }
  return counts;
}
