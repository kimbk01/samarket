import { describe, expect, it } from "vitest";
import {
  BUYER_MANAGE_TABS,
  countBuyerManageTabs,
  getBuyerManageTabId,
} from "@/lib/mypage/buyer-manage-tabs";
import type { PurchaseHistoryRow } from "@/components/mypage/purchases/PurchaseHistoryCard";

function row(partial: Partial<PurchaseHistoryRow>): PurchaseHistoryRow {
  return {
    chatId: "c1",
    postId: "p1",
    sellerId: "s1",
    sellerNickname: "seller",
    title: "item",
    price: 1,
    status: "active",
    thumbnail: "",
    createdAt: null,
    lastMessageAt: null,
    hasBuyerReview: false,
    ...partial,
  };
}

describe("buyer purchase tabs (CUT D)", () => {
  it("does not expose review_wait as a 1st-class tab", () => {
    expect(BUYER_MANAGE_TABS.map((t) => t.id)).toEqual(["trading", "completed", "cancelled"]);
  });

  it("maps buyer_confirmed and review_pending to completed", () => {
    expect(getBuyerManageTabId(row({ tradeFlowStatus: "buyer_confirmed" }), "b1")).toBe("completed");
    expect(getBuyerManageTabId(row({ tradeFlowStatus: "review_pending" }), "b1")).toBe("completed");
  });

  it("keeps in-progress chats on trading", () => {
    expect(getBuyerManageTabId(row({ tradeFlowStatus: "chatting" }), "b1")).toBe("trading");
    expect(getBuyerManageTabId(row({ tradeFlowStatus: "seller_marked_done" }), "b1")).toBe("trading");
  });

  it("counts buyer_confirmed into completed, not a review_wait bucket", () => {
    const counts = countBuyerManageTabs(
      [
        row({ tradeFlowStatus: "chatting", chatId: "c1" }),
        row({ tradeFlowStatus: "buyer_confirmed", chatId: "c2" }),
        row({ tradeFlowStatus: "review_pending", chatId: "c3" }),
        row({ tradeFlowStatus: "review_completed", hasBuyerReview: true, chatId: "c4" }),
        row({ tradeFlowStatus: "cancelled", chatId: "c5" }),
      ],
      "b1"
    );
    expect(counts).toEqual({ trading: 1, completed: 3, cancelled: 1 });
  });
});
