import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";
import { buildTradeChatListRowModel } from "@/lib/community-messenger/trade-chat-list/view-model";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);

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
      }),
      t
    );
    expect(m.categoryChipLabel).toBe("부동산");
    expect(m.productTitle).toBe("제목");
    expect(m.productPriceText).toBe("₱1");
  });

  it("prefers productCategoryLabel for chip when both labels are set", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "청소기",
          categoryMenuLabel: "중고거래",
          productCategoryLabel: "생활가전",
        },
      }),
      t
    );
    expect(m.categoryChipLabel).toBe("생활가전");
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
      }),
      t
    );
    expect(m.listingOwnerLine).toBe(`${t("chats_trade_list_owner_seller")}: 닉네임`);
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
      }),
      t
    );
    expect(m.listingOwnerLine).toBe(`${t("chats_trade_list_owner_author")}: 회사`);
  });

  it("defaults categoryChipLabel when absent", () => {
    const m = buildTradeChatListRowModel(
      room({ summary: JSON.stringify({ v: 1, kind: "trade", headline: "X" }) }),
      t
    );
    expect(m.categoryChipLabel).toBe(t("cm_ui_trade_headline_fallback"));
  });
});
