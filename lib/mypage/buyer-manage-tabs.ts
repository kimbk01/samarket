import type { MessageKey } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type { PurchaseHistoryRow } from "@/components/mypage/purchases/PurchaseHistoryCard";

/** 내정보 거래관리 — 구매내역 하위 탭 */
export type BuyerManageTabId = "trading" | "completed" | "cancelled" | "review_wait";

export const BUYER_MANAGE_TABS: { id: BuyerManageTabId; label: string; labelKey: MessageKey }[] = [
  { id: "trading", label: "거래중", labelKey: "tab_trading" },
  { id: "completed", label: "구매완료", labelKey: "tab_purchase_completed" },
  { id: "cancelled", label: "구매취소", labelKey: "tab_purchase_cancelled" },
  { id: "review_wait", label: "후기대기", labelKey: "tab_review_wait" },
];

type Row = Pick<
  PurchaseHistoryRow,
  "tradeFlowStatus" | "status" | "soldBuyerId" | "hasBuyerReview"
>;

export function getBuyerManageTabId(row: Row, _buyerUserId: string): BuyerManageTabId {
  const flow = String(row.tradeFlowStatus ?? "chatting");
  /** 다른 구매자 확정 등으로 방이 종료된 경우 — 판매 탭의 archived→cancelled 와 동일 분류 */
  if (flow === "archived") return "cancelled";
  if (flow === "cancelled") return "cancelled";

  const needReview =
    (flow === "buyer_confirmed" || flow === "review_pending") && !row.hasBuyerReview;
  if (needReview) return "review_wait";

  if (flow === "review_completed" || row.hasBuyerReview) {
    return "completed";
  }

  return "trading";
}

export function countBuyerManageTabs<T extends Row>(items: T[], buyerUserId: string): Record<BuyerManageTabId, number> {
  const counts: Record<BuyerManageTabId, number> = {
    trading: 0,
    completed: 0,
    cancelled: 0,
    review_wait: 0,
  };
  for (const row of items) {
    counts[getBuyerManageTabId(row, buyerUserId)] += 1;
  }
  return counts;
}

export function getBuyerManageTabLabel(
  id: BuyerManageTabId,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const tab = BUYER_MANAGE_TABS.find((item) => item.id === id);
  return tab ? translate(language, tab.labelKey) : id;
}
