import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canShowPurchaseReviewSend } from "@/lib/mypage/purchase-history-ui";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import {
  tradeHubChatRoomHref,
  tradeItemChatMessengerHrefIfLinked,
} from "@/lib/chats/surfaces/trade-chat-surface";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

const FORBIDDEN_REVIEW_PROMPT = /후기|리뷰|평가|후기 남기세요/;

describe("CUT D — member deep-links do not open review sheet", () => {
  it("tradeHubChatRoomHref ignores review opt", () => {
    const base = tradeHubChatRoomHref("room-abc", "product_chat");
    const withReview = tradeHubChatRoomHref("room-abc", "product_chat", { review: true });
    expect(withReview).toBe(base);
    expect(withReview).not.toContain("review=1");
  });

  it("tradeItemChatMessengerHrefIfLinked ignores openReview opt", () => {
    const room = {
      chatDomain: "trade",
      generalChat: null,
      communityMessengerRoomId: "cm-room-1",
    };
    const base = tradeItemChatMessengerHrefIfLinked(room, { sourceHint: "product_chat" });
    const withReview = tradeItemChatMessengerHrefIfLinked(room, {
      sourceHint: "product_chat",
      openReview: true,
    });
    expect(withReview).toBe(base);
    expect(withReview).not.toContain("review=1");
  });

  it("trade completion notification href targets messenger room without review query", () => {
    const href = tradeChatNotificationHref("pc-room-1", "product_chat");
    expect(href).toContain("/community-messenger/rooms/");
    expect(href).not.toContain("review=1");
  });
});

describe("CUT D — completion notification copy + deep-link (source audit)", () => {
  const buyerConfirmSrc = readRepoFile("app/api/trade/product-chat/[roomId]/buyer-confirm/route.ts");
  const sellerCompleteSrc = readRepoFile("app/api/trade/product-chat/[roomId]/seller-complete/route.ts");

  function extractNotificationBlock(src: string): string {
    const marker = "await appendUserNotification(sbAny";
    const start = src.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    return src.slice(start, start + 500);
  }

  it("buyer-confirm notification has no Marketplace review prompt copy", () => {
    const block = extractNotificationBlock(buyerConfirmSrc);
    expect(block).toContain('title: "구매자가 거래를 확인했어요"');
    expect(block).toContain('body: "거래가 완료되었어요."');
    expect(block).not.toMatch(FORBIDDEN_REVIEW_PROMPT);
    expect(block).toContain("tradeChatNotificationHref");
    expect(block).not.toContain("review=1");
  });

  it("seller-complete notification has no Marketplace review prompt copy", () => {
    const block = extractNotificationBlock(sellerCompleteSrc);
    expect(block).toContain('title: "거래가 완료 처리되었어요"');
    expect(block).toContain("tradeChatNotificationHref");
    expect(block).not.toMatch(FORBIDDEN_REVIEW_PROMPT);
    expect(block).not.toContain("review=1");
  });
});

describe("CUT D — reviews hub read-only", () => {
  it("TradeReviewsManagementView has received/written only — no pending write tab", () => {
    const src = readRepoFile("components/mypage/reviews/TradeReviewsManagementView.tsx");
    expect(src).toContain('"received" | "written"');
    expect(src).not.toMatch(/tab=pending|"pending"\s*\|\s*"hidden"/);
    expect(src).not.toContain("TradeReviewForm");
  });
});

describe("CUT D — purchase card has no review write sheet", () => {
  it("canShowPurchaseReviewSend stays false on purchase history (CUT 3 Trade Chat only)", () => {
    expect(canShowPurchaseReviewSend({ hasBuyerReview: false, tradeFlowStatus: "buyer_confirmed" })).toBe(
      false
    );
  });

  it("PurchaseHistoryCard does not import PurchaseReviewSheet or write CTA helpers", () => {
    const src = readRepoFile("components/mypage/purchases/PurchaseHistoryCard.tsx");
    expect(src).not.toContain("PurchaseReviewSheet");
    expect(src).not.toContain("canShowPurchaseReviewSend");
    expect(src).not.toContain("TradeReviewForm");
  });
});

describe("CUT D — sales card has no review progress badge copy", () => {
  it("SalesHistoryCard does not show buyer review wait / none badges", () => {
    const src = readRepoFile("components/mypage/sales/SalesHistoryCard.tsx");
    expect(src).not.toMatch(/구매자 후기 대기|후기 없음|후기대기/);
  });
});

describe("CUT D — API / data preserve", () => {
  it("submit-review route still exists", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "app/api/trade/product-chat/[roomId]/submit-review/route.ts"))).toBe(
      true
    );
  });
});

describe("CUT D — dead member link audit", () => {
  const memberPaths = [
    "components/mypage/purchases/PurchaseHistoryCard.tsx",
    "components/trade/TradeFlowBanner.tsx",
    "components/community-messenger/CommunityMessengerTradeProcessSection.tsx",
    "components/chats/ChatDetailView.tsx",
    "components/mypage/reviews/TradeReviewsManagementView.tsx",
    "lib/chats/surfaces/trade-chat-surface.ts",
    "app/(main)/mypage/trade/chat/[roomId]/page.tsx",
  ];

  it("member surfaces do not emit review=1 deep-links", () => {
    for (const rel of memberPaths) {
      const src = readRepoFile(rel);
      expect(src, rel).not.toContain('searchParams.set("review"');
      const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(withoutComments, rel).not.toContain("?review=1");
    }
  });
});
