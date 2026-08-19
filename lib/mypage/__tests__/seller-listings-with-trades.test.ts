import { describe, expect, it } from "vitest";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import {
  countActiveListingProducts,
  countOpenSellerChatRows,
  groupSalesRowsByPostId,
} from "@/lib/mypage/seller-listings-with-trades";

function row(partial: Partial<SalesHistoryRow> & { postId: string }): SalesHistoryRow {
  const { postId, ...rest } = partial;
  return {
    chatId: "c1",
    postId,
    buyerId: "b1",
    buyerNickname: "buyer",
    title: "t",
    price: 1,
    status: "active",
    thumbnail: "",
    lastMessageAt: null,
    createdAt: null,
    sellerCompletedAt: null,
    buyerConfirmedAt: null,
    hasBuyerReview: false,
    ...rest,
  };
}

describe("groupSalesRowsByPostId", () => {
  it("groups chat rows by post and skips no-chat synthetics", () => {
    const map = groupSalesRowsByPostId([
      row({ postId: "p1", chatId: "a", lastMessageAt: "2026-01-02T00:00:00Z" }),
      row({ postId: "p1", chatId: "b", lastMessageAt: "2026-01-03T00:00:00Z" }),
      row({ postId: "p2", chatId: "", noActiveChat: true }),
    ]);
    expect(map.get("p1")?.map((r) => r.chatId)).toEqual(["b", "a"]);
    expect(map.has("p2")).toBe(false);
  });
});

describe("countActiveListingProducts", () => {
  it("counts non-sold non-hidden listings", () => {
    expect(
      countActiveListingProducts([
        { status: "active" },
        { status: "sold" },
        { status: "hidden" },
      ])
    ).toBe(1);
  });
});

describe("countOpenSellerChatRows", () => {
  it("counts in-progress chat rows", () => {
    expect(
      countOpenSellerChatRows([
        row({ postId: "p1", tradeFlowStatus: "chatting" }),
        row({ postId: "p1", tradeFlowStatus: "archived" }),
      ])
    ).toBe(1);
  });
});
