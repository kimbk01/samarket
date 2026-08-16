import { describe, expect, it } from "vitest";
import {
  DIBAY_DOMAIN_CHROME,
  resolveDibayDomainChromeId,
} from "@/lib/ui/dibay-domain-chrome";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";
import {
  DIBAY_CATEGORY_RAIL_HOST_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_ACTIVE_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
  DIBAY_SECONDARY_TAB_TRACK_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
  DIBAY_STATUS_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

/** Image SSOT lock — visual tokens only. */
describe("dibay global header + secondary tabs SSOT", () => {
  it("locks domain pale surfaces from image SSOT", () => {
    expect(DIBAY_DOMAIN_CHROME.community.surface).toBe("#EBF2ED");
    expect(DIBAY_DOMAIN_CHROME.trade.surface).toBe("#EAF3EE");
    expect(DIBAY_DOMAIN_CHROME.delivery.surface).toBe("#F1F7EE");
    expect(DIBAY_DOMAIN_CHROME.chat.surface).toBe("#EBF2FB");
    expect(DIBAY_DOMAIN_CHROME.mypage.surface).toBe("#F3F2EB");
  });

  it("maps routes via resolveMainSurface only (no parallel resolver)", () => {
    expect(resolveDibayDomainChromeId(resolveMainSurface("/philife"))).toBe("community");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/market"))).toBe("trade");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/stores"))).toBe("delivery");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/chats"))).toBe("chat");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/community-messenger"))).toBe("chat");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/mypage"))).toBe("mypage");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/mypage/section/settings"))).toBe(
      "mypage",
    );
    expect(resolveDibayDomainChromeId(resolveMainSurface("/market/vehicle"))).toBe("trade");
    expect(resolveDibayDomainChromeId(resolveMainSurface("/stores/browse/food"))).toBe("delivery");
  });

  it("exposes secondary pill visual class contract", () => {
    expect(DIBAY_SECONDARY_TABS_CLASS).toBe("dibay-secondary-tabs");
    expect(dibaySecondaryTabClass(false)).toBe("dibay-secondary-tab");
    expect(dibaySecondaryTabClass(true)).toBe(DIBAY_SECONDARY_TAB_ACTIVE_CLASS);
    expect(DIBAY_SECONDARY_TAB_ACTIVE_CLASS).toContain("dibay-secondary-tab--active");
    expect(DIBAY_CHROME_SECONDARY_HOST_CLASS).toContain("--dibay-domain-surface");
    expect(DIBAY_STATUS_TABS_CLASS).toContain("dibay-status-tabs");
    expect(DIBAY_CATEGORY_RAIL_HOST_CLASS).toContain("dibay-category-rail-host");
    expect(DIBAY_CATEGORY_RAIL_HOST_CLASS).not.toMatch(/overflow-x-hidden/);
    expect(DIBAY_SECONDARY_TAB_ROW_CLASS).toContain("--dibay-secondary-tab-gap");
    expect(DIBAY_SECONDARY_TAB_TRACK_CLASS).toContain("px-0");
  });

  it("forbids trade wipe specialty class in trade-primary-tabs-classes", async () => {
    const { TRADE_PRIMARY_TAB_PILL_SHELL } = await import("@/lib/trade/ui/trade-primary-tabs-classes");
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).toBe("dibay-secondary-tab");
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).not.toContain("overflow-hidden");
  });

  it("community / trade / chat 2단 use DibaySecondaryTabRow and forbid gap-1 on row", () => {
    const community = readFileSync(join(root, "components/community/CommunityFeed.tsx"), "utf8");
    const trade = readFileSync(join(root, "components/trade/TradePrimaryTabs.tsx"), "utf8");
    const messenger = readFileSync(
      join(root, "components/community-messenger/MessengerHomeSectionTabs.tsx"),
      "utf8"
    );
    const chatHub = readFileSync(join(root, "components/chats/ChatHubTopTabs.tsx"), "utf8");
    for (const [name, src] of [
      ["CommunityFeed", community],
      ["TradePrimaryTabs", trade],
      ["MessengerHomeSectionTabs", messenger],
      ["ChatHubTopTabs", chatHub],
    ] as const) {
      expect(src, name).toContain("DibaySecondaryTabRow");
      expect(src, name).not.toMatch(/gap-1(?![0-9])/);
    }
  });
});
