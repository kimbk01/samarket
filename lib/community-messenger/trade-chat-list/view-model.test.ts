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
  it("reads categoryChipLabel from categoryMenuLabel first", () => {
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

  it("prefers categoryMenuLabel over productCategoryLabel for chip", () => {
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
    expect(m.categoryChipLabel).toBe("중고거래");
  });

  it("normalizes listingState from itemStateLabel", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "제목",
          itemStateLabel: "문의중",
        },
      }),
      t
    );
    expect(m.listingState).toBe("negotiating");
    expect(m.statusLabel).toBe(t("trade_listing_step_negotiating"));
    expect(m.statusTone).toBe("progress");
  });

  it("exposes rolePrefix for seller viewer", () => {
    const m = buildTradeChatListRowModel(
      room({
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "제목",
          roleLabel: "판매자",
          sellerId: "user-seller",
        },
      }),
      t,
      "user-seller"
    );
    expect(m.viewerRole).toBe("seller");
    expect(m.rolePrefix).toBe(t("cm_trade_chat_role_sale"));
    expect(m.statusBadgeClassName).toContain("bg-");
  });

  it("maps completed state tone", () => {
    const m = buildTradeChatListRowModel(
      room({
        isReadonly: true,
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "제목",
          itemStateLabel: "판매완료",
          completedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      t
    );
    expect(m.listingState).toBe("completed");
    expect(m.statusTone).toBe("completed");
  });
});
