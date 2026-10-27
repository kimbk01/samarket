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
    /** 거래 X-3 (2026-10-28): 연쇄 RSC redirect 금지 — 판매자 관리로 한 번에 */
    expect(sales).toContain('redirect("/mypage/products")');
    /** 거래 후기 없음(Owner 2026-10-28) — 옛 후기 주소도 판매자 관리로 한 번에 */
    expect(reviews).toContain('redirect("/mypage/products")');
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

  it("home trade menu uses hub constants for recent; no trade reviews row", () => {
    const src = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    expect(src).toContain("MYPAGE_HOME_RECENT_VIEWED_HREF");
    expect(src).not.toContain("MYPAGE_HOME_TRADE_REVIEWS_HREF");
    // 최종 설계 §2.1 — 홈 진행중 거래 행은 리다이렉트 왕복 없이 `/mypage/products` 직행 상수 사용
    expect(src).toContain("href: MYPAGE_HOME_MY_PRODUCTS_HREF");
    expect(src).not.toContain("mypage_comp_nav_sec_trade_purchases_label");
  });

  it("next.config HTTP redirects cover legacy activity shells", () => {
    const src = readFileSync(path.join(root, "next.config.js"), "utf8");
    expect(src).toContain('source: "/mypage/purchases"');
    expect(src).toContain('destination: "/community-messenger/trade-chats"');
    /** 거래 X-3: 내 거래 옛 주소는 HTTP 307 로 `/mypage/products` 한 번에(React #310 방지) */
    for (const source of ["/mypage/trade", "/mypage/trade/sales", "/mypage/trade/reviews", "/mypage/sales", "/mypage/reviews", "/my/reviews"]) {
      expect(src).toContain(`source: "${source}",\n        destination: "/mypage/products"`);
    }
  });
});
