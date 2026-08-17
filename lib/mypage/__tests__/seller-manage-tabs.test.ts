import { describe, expect, it } from "vitest";
import {
  countSellerManageTabs,
  getSellerManageTabId,
  isSellerReviewWait,
  parseSellerManageTabId,
  SELLER_MANAGE_TABS,
} from "@/lib/mypage/seller-manage-tabs";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

function row(partial: Partial<SalesHistoryRow>): SalesHistoryRow {
  return {
    chatId: "c1",
    postId: "p1",
    buyerId: "b1",
    buyerNickname: "buyer",
    title: "item",
    price: 1,
    status: "active",
    thumbnail: "",
    lastMessageAt: null,
    createdAt: null,
    sellerCompletedAt: null,
    buyerConfirmedAt: null,
    hasBuyerReview: false,
    ...partial,
  };
}

describe("parseSellerManageTabId", () => {
  it("folds reserved/review_wait 모아보기 into list tabs", () => {
    expect(parseSellerManageTabId("reserved")).toBe("selling");
    expect(parseSellerManageTabId("review_wait")).toBe("completed");
    expect(parseSellerManageTabId("selling")).toBe("selling");
    expect(parseSellerManageTabId("completed")).toBe("completed");
    expect(parseSellerManageTabId("cancelled")).toBe("cancelled");
  });
});

describe("seller sales list tabs", () => {
  it("does not expose reserved or review_wait as 1st-class tabs", () => {
    expect(SELLER_MANAGE_TABS.map((t) => t.id)).toEqual(["selling", "completed", "cancelled"]);
  });

  it("keeps reserved chats on selling, not a reserved tab", () => {
    const reserved = row({
      status: "reserved",
      sellerListingState: "reserved",
      tradeFlowStatus: "chatting",
    });
    expect(getSellerManageTabId(reserved)).toBe("selling");
    expect(isSellerReviewWait(reserved)).toBe(false);
  });

  it("keeps review-wait chats on completed while preserving review hub entry", () => {
    const waiting = row({
      status: "sold",
      sellerListingState: "completed",
      tradeFlowStatus: "buyer_confirmed",
      hasBuyerReview: false,
      chatId: "c-wait",
    });
    expect(getSellerManageTabId(waiting)).toBe("completed");
    expect(isSellerReviewWait(waiting)).toBe(true);
  });

  it("does not send buyer_confirmed/review_pending to completed unless listing is sold", () => {
    const notSold = row({
      status: "active",
      sellerListingState: "negotiating",
      tradeFlowStatus: "buyer_confirmed",
      hasBuyerReview: false,
      chatId: "c-early",
    });
    expect(isSellerReviewWait(notSold)).toBe(false);
    expect(getSellerManageTabId(notSold)).toBe("selling");
  });

  it("counts reserved into selling and review-wait into completed", () => {
    const counts = countSellerManageTabs([
      row({ status: "reserved", sellerListingState: "reserved", chatId: "c-r" }),
      row({
        status: "sold",
        sellerListingState: "completed",
        tradeFlowStatus: "buyer_confirmed",
        chatId: "c-w",
      }),
      row({ status: "sold", tradeFlowStatus: "review_completed", hasBuyerReview: true, chatId: "c-d" }),
      row({ tradeFlowStatus: "cancelled", chatId: "c-x" }),
    ]);
    expect(counts).toEqual({ selling: 1, completed: 2, cancelled: 1 });
  });
});
