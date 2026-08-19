import { describe, expect, it } from "vitest";
import { buildActiveTradeCountByPostId } from "@/lib/mypage/seller-active-trade-counts-by-post";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

function row(partial: Partial<SalesHistoryRow> & { postId: string }): SalesHistoryRow {
  const { postId, ...rest } = partial;
  return {
    chatId: "chat-1",
    postId,
    buyerId: "buyer-1",
    buyerNickname: "buyer",
    title: "t",
    price: 1,
    status: "active",
    thumbnail: "",
    lastMessageAt: null,
    hasBuyerReview: false,
    sellerCompletedAt: null,
    buyerConfirmedAt: null,
    createdAt: null,
    ...rest,
  };
}

describe("buildActiveTradeCountByPostId", () => {
  it("counts only rows with active chat per post", () => {
    const map = buildActiveTradeCountByPostId([
      row({ postId: "p1", chatId: "c1" }),
      row({ postId: "p1", chatId: "c2" }),
      row({ postId: "p2", chatId: "c3" }),
      row({ postId: "p3", chatId: "", noActiveChat: true }),
      row({ postId: "p4", chatId: "c4", noActiveChat: true }),
    ]);
    expect(map.get("p1")).toBe(2);
    expect(map.get("p2")).toBe(1);
    expect(map.has("p3")).toBe(false);
    expect(map.has("p4")).toBe(false);
  });
});
