import { describe, expect, it } from "vitest";
import {
  buildAdminTradeChatsHref,
  buildAdminTradeFlowHref,
  matchAdminChatRoomToDeepLink,
  matchAdminTradeFlowSessionToDeepLink,
  parseAdminTradeChatDeepLink,
  parseAdminTradeFlowDeepLink,
  pickPreferredTradeChatIds,
} from "@/lib/admin-products/admin-trade-deep-link";

describe("admin-trade-deep-link", () => {
  const product = {
    id: "d4202356-0d3f-47bd-9faa-814407ee2604",
    sellerId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
    soldBuyerId: "11111111-1111-1111-1111-111111111111",
    reservedBuyerId: null,
    tradeChatRoomId: "17045e00-5e6f-4b0b-9582-532e0a242e58",
    tradeProductChatId: "bfa172bc-3460-4100-88a0-0727d501821d",
  };

  it("chat href includes postId + roomId + buyer + seller", () => {
    const href = buildAdminTradeChatsHref(product);
    expect(href.startsWith("/admin/chats/trade?")).toBe(true);
    const q = new URL(href, "https://example.com").searchParams;
    expect(q.get("postId")).toBe(product.id);
    expect(q.get("roomId")).toBe(product.tradeChatRoomId);
    expect(q.get("buyerId")).toBe(product.soldBuyerId);
    expect(q.get("sellerId")).toBe(product.sellerId);
  });

  it("trade-flow href includes postId + productChatId", () => {
    const href = buildAdminTradeFlowHref(product);
    expect(href.startsWith("/admin/trade-flow?")).toBe(true);
    const q = new URL(href, "https://example.com").searchParams;
    expect(q.get("postId")).toBe(product.id);
    expect(q.get("productChatId")).toBe(product.tradeProductChatId);
    expect(q.get("roomId")).toBe(product.tradeChatRoomId);
  });

  it("does not emit generic hub-only href when postId present", () => {
    expect(buildAdminTradeChatsHref({ id: product.id })).toContain("postId=");
    expect(buildAdminTradeFlowHref({ id: product.id })).toContain("postId=");
    expect(buildAdminTradeChatsHref({ id: product.id })).not.toBe("/admin/chats/trade");
    expect(buildAdminTradeFlowHref({ id: product.id })).not.toBe("/admin/trade-flow");
  });

  it("match chat rooms by roomId first", () => {
    const rooms = [
      { id: "other", productId: product.id, buyerId: "x", sellerId: product.sellerId },
      {
        id: product.tradeChatRoomId!,
        productId: product.id,
        buyerId: product.soldBuyerId!,
        sellerId: product.sellerId!,
      },
    ];
    const q = parseAdminTradeChatDeepLink({
      get: (k) =>
        ({
          postId: product.id,
          roomId: product.tradeChatRoomId,
          buyerId: product.soldBuyerId,
          sellerId: product.sellerId,
        })[k] ?? null,
    });
    const hit = matchAdminChatRoomToDeepLink(rooms, q);
    expect(hit).toHaveLength(1);
    expect(hit[0].id).toBe(product.tradeChatRoomId);
  });

  it("match trade-flow sessions by postId", () => {
    const sessions = [
      { id: "aaa", post_id: "other" },
      { id: product.tradeProductChatId!, post_id: product.id },
    ];
    const q = parseAdminTradeFlowDeepLink({
      get: (k) => (k === "postId" ? product.id : null),
    });
    const hit = matchAdminTradeFlowSessionToDeepLink(sessions, q);
    expect(hit).toHaveLength(1);
    expect(hit[0].id).toBe(product.tradeProductChatId);
  });

  it("pickPreferredTradeChatIds prefers bound buyer", () => {
    const ids = pickPreferredTradeChatIds({
      preferredBuyerId: "buyer-b",
      chatRooms: [
        { id: "room-a", buyer_id: "buyer-a" },
        { id: "room-b", buyer_id: "buyer-b" },
      ],
      productChats: [
        { id: "pc-a", buyer_id: "buyer-a" },
        { id: "pc-b", buyer_id: "buyer-b" },
      ],
    });
    expect(ids.tradeChatRoomId).toBe("room-b");
    expect(ids.tradeProductChatId).toBe("pc-b");
  });
});
