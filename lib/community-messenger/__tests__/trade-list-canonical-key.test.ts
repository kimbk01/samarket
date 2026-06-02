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
});
