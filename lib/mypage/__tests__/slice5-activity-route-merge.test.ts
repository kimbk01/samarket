import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import {
  tradePurchaseDetailPath,
  tradePurchasesPath,
  tradeSalesPath,
} from "@/lib/mypage/trade-hub-paths";
import {
  MYPAGE_HOME_RECENT_VIEWED_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

const root = path.resolve(__dirname, "../../..");

describe("Slice5 Activity route MERGE", () => {
  it("legacy list shells redirect to trade hub", () => {
    const purchases = readFileSync(path.join(root, "app/(main)/mypage/purchases/page.tsx"), "utf8");
    const sales = readFileSync(path.join(root, "app/(main)/mypage/sales/page.tsx"), "utf8");
    const reviews = readFileSync(path.join(root, "app/(main)/mypage/reviews/page.tsx"), "utf8");
    expect(purchases).toContain("redirect");
    expect(purchases).toContain("MYPAGE_HOME_TRADE_HUB_HREF");
    expect(sales).toContain("MYPAGE_HOME_TRADE_SALES_HREF");
    expect(reviews).toContain("/mypage/trade/reviews");
  });

  it("section trade:recent maps to recent-viewed hub", () => {
    expect(resolveMypageSectionLegacyHubRedirect("trade", "recent")).toBe(
      MYPAGE_HOME_RECENT_VIEWED_HREF,
    );
  });

  it("trade hub paths always use trade_shell list destinations", () => {
    expect(tradePurchasesPath("mypage_legacy")).toBe("/mypage/trade/purchases");
    expect(tradeSalesPath("mypage_legacy")).toBe(MYPAGE_HOME_TRADE_SALES_HREF);
    expect(tradePurchaseDetailPath("mypage_legacy", "abc")).toContain(
      "/community-messenger/rooms/abc",
    );
  });

  it("home trade menu uses hub constants for recent and reviews", () => {
    const src = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    expect(src).toContain("MYPAGE_HOME_RECENT_VIEWED_HREF");
    expect(src).toContain("MYPAGE_HOME_TRADE_REVIEWS_HREF");
    expect(src).toContain("MYPAGE_HOME_TRADE_HUB_HREF");
  });
});
