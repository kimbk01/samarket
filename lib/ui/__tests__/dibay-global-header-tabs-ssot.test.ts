import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIBAY_DOMAIN_CHROME,
  resolveDibayDomainChromeId,
} from "@/lib/ui/dibay-domain-chrome";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";
import {
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_ACTIVE_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

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
  });

  it("locks secondary chrome host to domain surface token (no white sam-surface break)", () => {
    expect(DIBAY_CHROME_SECONDARY_HOST_CLASS).toContain("--dibay-domain-surface");
    expect(DIBAY_CHROME_SECONDARY_HOST_CLASS).not.toContain("bg-sam-surface");
  });

  it("Trade / MyPage chrome secondary hosts use domain host class", () => {
    const root = process.cwd();
    for (const rel of [
      "components/trade/TradePrimaryTabs.tsx",
      "components/my/MyManagedCtaStrip.tsx",
      "components/mypage/trade/TradeHubTopTabs.tsx",
      "components/mypage/trade/TradeHubPrimarySurface.tsx",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).toContain("DIBAY_CHROME_SECONDARY_HOST_CLASS");
      // Portal menus may keep bg-sam-surface; strip those lines for host check
      const withoutMenus = src
        .split("\n")
        .filter((line) => !line.includes("shadow-sam-elevated") && !line.includes("role=\"listbox\""))
        .join("\n");
      expect(withoutMenus).not.toMatch(/\bbg-sam-surface\b(?!-muted)/);
    }
  });

  it("CommunityFeed secondary host uses domain host class SSOT", () => {
    const src = readFileSync(join(process.cwd(), "components/community/CommunityFeed.tsx"), "utf8");
    expect(src).toContain("DIBAY_CHROME_SECONDARY_HOST_CLASS");
  });
});
