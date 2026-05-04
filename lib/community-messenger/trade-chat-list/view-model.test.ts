import { describe, expect, it } from "vitest";
import { buildTradeChatListRowModel } from "@/lib/community-messenger/trade-chat-list/view-model";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(overrides: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: "room-1",
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "상대",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-05-04T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...overrides,
  };
}

describe("buildTradeChatListRowModel", () => {
  it("reads categoryChipLabel from trade contextMeta (coarse menu)", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "제목",
          priceLabel: "₱1",
          categoryMenuLabel: "부동산",
        },
      })
    );
    expect(m.categoryChipLabel).toBe("부동산");
    expect(m.productTitle).toBe("제목");
    expect(m.productPriceText).toBe("₱1");
  });

  it("uses categoryMenuLabel for chip even when productCategoryLabel is set", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "청소기",
          categoryMenuLabel: "중고거래",
          productCategoryLabel: "생활가전",
        },
      })
    );
    expect(m.categoryChipLabel).toBe("중고거래");
  });

  it("builds listingOwnerLine from sellerDisplayName", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "제목",
          categoryMenuLabel: "중고거래",
          sellerDisplayName: "닉네임",
        },
      })
    );
    expect(m.listingOwnerLine).toBe("판매자: 닉네임");
  });

  it("uses 작성자 prefix for 일자리", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "구인",
          categoryMenuLabel: "일자리",
          sellerDisplayName: "회사",
        },
      })
    );
    expect(m.listingOwnerLine).toBe("작성자: 회사");
  });

  it("defaults categoryChipLabel when absent", () => {
    const m = buildTradeChatListRowModel(room({ summary: JSON.stringify({ v: 1, kind: "trade", headline: "X" }) }));
    expect(m.categoryChipLabel).toBe("중고거래");
  });
});
