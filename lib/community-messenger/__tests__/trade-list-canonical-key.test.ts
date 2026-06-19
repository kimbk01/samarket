import { describe, expect, it } from "vitest";
import {
  dedupeTradeMessengerRoomSummaries,
  tradeMessengerListCanonicalKey,
} from "@/lib/community-messenger/trade-list-canonical-key";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function tradeSummary(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "r1",
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: partial.lastMessageAt ?? "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("tradeMessengerListCanonicalKey", () => {
  it("uses productChatId from trade meta", () => {
    const key = tradeMessengerListCanonicalKey(
      tradeSummary({
        contextMeta: {
          v: 1,
          kind: "trade",
          productChatId: "pc-1",
          postId: "post-1",
        },
      })
    );
    expect(key).toBe("pc:pc-1");
  });

  it("uses trade triple when productChatId is missing", () => {
    const key = tradeMessengerListCanonicalKey(
      tradeSummary({
        id: "room-a",
        contextMeta: {
          v: 1,
          kind: "trade",
          postId: "post-1",
          sellerId: "seller-1",
          buyerId: "buyer-a",
        },
      })
    );
    expect(key).toBe("trade:post-1:seller-1:buyer-a");
  });

  it("does not collapse different buyers on the same post", () => {
    const buyerA = tradeMessengerListCanonicalKey(
      tradeSummary({
        id: "room-a",
        contextMeta: {
          v: 1,
          kind: "trade",
          postId: "post-1",
          sellerId: "seller-1",
          buyerId: "buyer-a",
        },
      })
    );
    const buyerB = tradeMessengerListCanonicalKey(
      tradeSummary({
        id: "room-b",
        contextMeta: {
          v: 1,
          kind: "trade",
          postId: "post-1",
          sellerId: "seller-1",
          buyerId: "buyer-b",
        },
      })
    );
    expect(buyerA).not.toBe(buyerB);
  });

  it("falls back to room id when triple is incomplete", () => {
    const key = tradeMessengerListCanonicalKey(
      tradeSummary({
        id: "room-only",
        contextMeta: { v: 1, kind: "trade", postId: "post-1" },
      })
    );
    expect(key).toBe("room:room-only");
  });
});

describe("dedupeTradeMessengerRoomSummaries", () => {
  it("keeps one row per productChatId preferring newer lastMessageAt", () => {
    const older = tradeSummary({
      id: "room-pc",
      messengerDirectKey: "trade_pc:pc-1",
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", postId: "post-1" },
    });
    const newer = tradeSummary({
      id: "room-item",
      messengerDirectKey: "trade_item:cr-1",
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", postId: "post-1" },
    });
    const dm = tradeSummary({
      id: "dm-1",
      roomType: "direct",
      contextMeta: null,
      messengerDirectKey: "u1:u2",
    });
    const out = dedupeTradeMessengerRoomSummaries([older, newer, dm]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.id === "room-item")).toBeTruthy();
    expect(out.find((r) => r.id === "room-pc")).toBeFalsy();
    expect(out.find((r) => r.id === "dm-1")).toBeTruthy();
  });

  it("keeps separate rows for same postId with different buyerId", () => {
    const a = tradeSummary({
      id: "room-a",
      contextMeta: {
        v: 1,
        kind: "trade",
        postId: "post-1",
        sellerId: "seller-1",
        buyerId: "buyer-a",
      },
    });
    const b = tradeSummary({
      id: "room-b",
      contextMeta: {
        v: 1,
        kind: "trade",
        postId: "post-1",
        sellerId: "seller-1",
        buyerId: "buyer-b",
      },
    });
    const out = dedupeTradeMessengerRoomSummaries([a, b]);
    expect(out).toHaveLength(2);
  });
});
