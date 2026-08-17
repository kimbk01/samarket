import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import {
  tradePurchaseDetailLegacyPath,
  tradePurchaseDetailPath,
  tradePurchasesPath,
  tradeSalesPath,
} from "@/lib/mypage/trade-hub-paths";
import {
  TRADE_CHAT_MESSENGER_LIST_HREF,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import {
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("CUT E — buyer purchase surface removal", () => {
  it("tradePurchasesPath points to Messenger trade list", () => {
    expect(tradePurchasesPath()).toBe(TRADE_CHAT_MESSENGER_LIST_HREF);
  });

  it("legacy purchase detail paths resolve to Messenger room", () => {
    expect(tradePurchaseDetailPath("trade_shell", "room-abc")).toBe(
      tradeHubChatRoomHref("room-abc", "product_chat")
    );
    expect(tradePurchaseDetailLegacyPath("room-abc")).toBe("/mypage/purchases/room-abc");
  });

  it("section trade:purchases legacy redirect → Messenger list", () => {
    expect(resolveMypageSectionLegacyHubRedirect("trade", "purchases")).toBe(
      TRADE_CHAT_MESSENGER_LIST_HREF
    );
  });

  it("trade hub index redirects to sales default", () => {
    const src = readRepoFile("app/(main)/mypage/trade/page.tsx");
    expect(src).toContain("redirect");
    expect(src).toContain("MYPAGE_HOME_TRADE_SALES_HREF");
  });

  it("legacy purchase list routes redirect to Messenger list", () => {
    for (const rel of [
      "app/(main)/mypage/purchases/page.tsx",
      "app/(main)/mypage/trade/purchases/page.tsx",
      "app/(main)/philife/purchases/page.tsx",
    ]) {
      const src = readRepoFile(rel);
      expect(src).toContain("TRADE_CHAT_MESSENGER_LIST_HREF");
      expect(src).toContain("redirect");
    }
  });

  it("legacy purchase detail routes redirect to Messenger room", () => {
    for (const rel of [
      "app/(main)/mypage/purchases/[chatId]/page.tsx",
      "app/(main)/philife/purchases/[chatId]/page.tsx",
    ]) {
      const src = readRepoFile(rel);
      expect(src).toContain("tradeHubChatRoomHref");
      expect(src).toContain("redirect");
      expect(src).not.toContain("PurchaseDetailView");
    }
  });

  it("TradeHubTopTabs has no buyer purchase tab", () => {
    const src = readRepoFile("components/mypage/trade/TradeHubTopTabs.tsx");
    expect(src).not.toContain("nav_trade_hub_purchases");
    expect(src).not.toContain('key: "purchases"');
    expect(src).toContain("nav_trade_hub_sales");
  });

  it("AccountTab uses salesCount only with sales label", () => {
    const src = readRepoFile("components/mypage/tabs/AccountTab.tsx");
    expect(src).toContain("overviewCounts.sales");
    expect(src).not.toContain("overviewCounts.purchases");
    expect(src).toContain("mypage_comp_trade_nav_sales");
    expect(src).not.toContain("mypage_comp_stat_active_trade");
  });

  it("purchase API routes preserved", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "app/api/my/purchases/route.ts"))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, "app/api/my/trade-counts/route.ts"))).toBe(true);
  });

  it("sales path unchanged", () => {
    expect(tradeSalesPath()).toBe(MYPAGE_HOME_TRADE_SALES_HREF);
  });

  it("next.config legacy purchase list → Messenger", () => {
    const src = readRepoFile("next.config.js");
    expect(src).toContain('source: "/mypage/purchases"');
    expect(src).toContain('destination: "/community-messenger/trade-chats"');
    expect(src).toContain('source: "/mypage/trade/purchases"');
  });
});
