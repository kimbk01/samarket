import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import {
  tradePurchaseDetailPath,
  tradePurchasesPath,
  tradeSalesPath,
} from "@/lib/mypage/trade-hub-paths";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import {
  MYPAGE_HOME_RECENT_VIEWED_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

const root = path.resolve(__dirname, "../../..");

describe("Slice5 Activity route MERGE", () => {
  it("legacy list shells redirect to CUT E destinations", () => {
    const purchases = readFileSync(path.join(root, "app/(main)/mypage/purchases/page.tsx"), "utf8");
    const sales = readFileSync(path.join(root, "app/(main)/mypage/sales/page.tsx"), "utf8");
    const reviews = readFileSync(path.join(root, "app/(main)/mypage/reviews/page.tsx"), "utf8");
    expect(purchases).toContain("redirect");
    expect(purchases).toContain("TRADE_CHAT_MESSENGER_LIST_HREF");
    expect(sales).toContain("MYPAGE_HOME_TRADE_SALES_HREF");
    expect(reviews).toContain("/mypage/trade/reviews");
  });

  it("section trade:recent maps to recent-viewed hub", () => {
    expect(resolveMypageSectionLegacyHubRedirect("trade", "recent")).toBe(
      MYPAGE_HOME_RECENT_VIEWED_HREF,
    );
  });

  it("trade hub paths — purchases list → Messenger, sales unchanged", () => {
    expect(tradePurchasesPath("mypage_legacy")).toBe(TRADE_CHAT_MESSENGER_LIST_HREF);
    expect(tradeSalesPath("mypage_legacy")).toBe(MYPAGE_HOME_TRADE_SALES_HREF);
    expect(tradePurchaseDetailPath("mypage_legacy", "abc")).toContain(
      "/community-messenger/rooms/abc",
    );
  });

  it("home trade menu uses hub constants for recent and reviews", () => {
    const src = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    expect(src).toContain("MYPAGE_HOME_RECENT_VIEWED_HREF");
    expect(src).toContain("MYPAGE_HOME_TRADE_REVIEWS_HREF");
    expect(src).toContain("MYPAGE_HOME_TRADE_SALES_HREF");
    expect(src).not.toContain("mypage_comp_nav_sec_trade_purchases_label");
  });

  it("next.config HTTP redirects cover legacy activity shells", () => {
    const src = readFileSync(path.join(root, "next.config.js"), "utf8");
    expect(src).toContain('source: "/mypage/purchases"');
    expect(src).toContain('destination: "/community-messenger/trade-chats"');
  });
});
