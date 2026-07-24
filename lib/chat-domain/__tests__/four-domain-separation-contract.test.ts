/**
 * 4-domain separation contracts — identity builders + classification must not cross domains.
 */
import { describe, expect, it } from "vitest";
import {
  generalDirectRoomIdentity,
  storeOrderRoomIdentity,
  tradeRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import {
  plannedColumnsForGeneralDirect,
  plannedColumnsForStoreOrderRoom,
  plannedColumnsForTrade,
} from "@/lib/chat-domain/domain-identity-legacy-map";
import { resolveMessengerHomeBucket } from "@/lib/community-messenger/home/inbox-pipeline/classification";
import type { CanonicalMessengerHomeRoom } from "@/lib/community-messenger/home/inbox-pipeline/types";
import { isTradeCapableCommunityMessengerRoom } from "@/lib/trade/ensure-messenger-room-for-trade-chat";
import { tradeHubChatComposeHref, tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";

describe("4 domain canonical identity keys", () => {
  it("keeps GD / trade X / trade Y / store_order as distinct identities", () => {
    const gd = generalDirectRoomIdentity("user-a", "user-b");
    const tradeX = tradeRoomIdentity({ itemId: "item-x", sellerId: "user-b", buyerId: "user-a" });
    const tradeY = tradeRoomIdentity({ itemId: "item-y", sellerId: "user-b", buyerId: "user-a" });
    const so = storeOrderRoomIdentity("order-z");

    expect(gd.identityKey).toBe("general_direct:user-a:user-b");
    expect(tradeX.identityKey).toBe("trade:item-x:user-b:user-a");
    expect(tradeY.identityKey).toBe("trade:item-y:user-b:user-a");
    expect(so.identityKey).toBe("store_order:order-z");

    const keys = new Set([gd.identityKey, tradeX.identityKey, tradeY.identityKey, so.identityKey]);
    expect(keys.size).toBe(4);
  });

  it("planned columns match room-identity long form", () => {
    expect(plannedColumnsForGeneralDirect("b", "a").domain_identity).toBe("general_direct:a:b");
    expect(plannedColumnsForTrade("i1", "seller", "buyer").domain_identity).toBe("trade:i1:seller:buyer");
    expect(plannedColumnsForStoreOrderRoom("o1").domain_identity).toBe("store_order:o1");
  });

  it("same item reuses same trade identity", () => {
    const a = tradeRoomIdentity({ itemId: "item-x", sellerId: "s", buyerId: "b" });
    const b = tradeRoomIdentity({ itemId: "item-x", sellerId: "s", buyerId: "b" });
    expect(a.identityKey).toBe(b.identityKey);
  });
});

describe("home bucket domain boundary", () => {
  function canon(
    partial: Partial<CanonicalMessengerHomeRoom> & Pick<CanonicalMessengerHomeRoom, "roomId">
  ): CanonicalMessengerHomeRoom {
    return {
      roomId: partial.roomId,
      roomType: partial.roomType ?? "direct",
      roomStatus: partial.roomStatus ?? "active",
      title: partial.title ?? "",
      avatarUrl: partial.avatarUrl ?? null,
      unreadCount: partial.unreadCount ?? 0,
      latestMessage: partial.latestMessage ?? "",
      latestMessageType: partial.latestMessageType ?? "text",
      lastMessageAt: partial.lastMessageAt ?? "2026-01-01T00:00:00.000Z",
      memberCount: partial.memberCount ?? 2,
      isArchived: partial.isArchived ?? false,
      isBlockedHidden: partial.isBlockedHidden ?? false,
      directKey: partial.directKey ?? null,
      contextMeta: partial.contextMeta ?? null,
      chatDomain: partial.chatDomain ?? null,
      domainIdentity: partial.domainIdentity ?? null,
    };
  }

  it("does not place trade room in direct bucket or GD in trade", () => {
    const gd = canon({
      roomId: "gd-1",
      chatDomain: "general_direct",
      domainIdentity: "general_direct:a:b",
      directKey: "a:b",
    });
    const trade = canon({
      roomId: "tr-1",
      chatDomain: "trade",
      domainIdentity: "trade:item:s:b",
      directKey: "trade_pc:pc1",
    });
    expect(resolveMessengerHomeBucket(gd, "a")).toBe("direct");
    expect(resolveMessengerHomeBucket(trade, "a")).toBe("trade");
  });

  it("peer-equal GD and trade stay in different buckets", () => {
    const gd = canon({
      roomId: "gd-1",
      chatDomain: "general_direct",
      directKey: "a:b",
    });
    const trade = canon({
      roomId: "tr-1",
      chatDomain: "trade",
      directKey: "trade_item:cr1",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc1" },
    });
    expect(resolveMessengerHomeBucket(gd, "a")).toBe("direct");
    expect(resolveMessengerHomeBucket(trade, "a")).toBe("trade");
  });
});

describe("trade entry route surface", () => {
  it("compose and room href stay on trade hub surface", () => {
    const compose = tradeHubChatComposeHref({ productId: "prod-1" });
    const room = tradeHubChatRoomHref("cm-room-1", "chat_room");
    expect(compose).toContain("productId=prod-1");
    expect(compose).toMatch(/trade\/chat\/compose|mypage\/trade/);
    expect(room).toContain("cm-room-1");
    expect(room).toContain("community-messenger");
  });
});

describe("isTradeCapableCommunityMessengerRoom", () => {
  it("rejects general_direct and pair-key rooms", async () => {
    const rows: Record<string, { direct_key: string; chat_domain: string | null }> = {
      "gd-1": { direct_key: "a:b", chat_domain: "general_direct" },
      "pair-1": { direct_key: "a:b", chat_domain: null },
      "tr-1": { direct_key: "trade_pc:pc1", chat_domain: "trade" },
    };
    const sb = {
      from: () => ({
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: rows[id] ?? null, error: null }),
          }),
        }),
      }),
    };
    expect(await isTradeCapableCommunityMessengerRoom(sb as never, "gd-1")).toBe(false);
    expect(await isTradeCapableCommunityMessengerRoom(sb as never, "pair-1")).toBe(false);
    expect(await isTradeCapableCommunityMessengerRoom(sb as never, "tr-1")).toBe(true);
  });
});
