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
  DIBAY_SECONDARY_TABS_CLASS,
  DIBAY_STATUS_TABS_CLASS,
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
    expect(DIBAY_CHROME_SECONDARY_HOST_CLASS).toContain("--dibay-domain-surface");
    expect(DIBAY_STATUS_TABS_CLASS).toContain("dibay-status-tabs");
    expect(DIBAY_CATEGORY_RAIL_HOST_CLASS).toContain("dibay-category-rail-host");
    expect(DIBAY_CATEGORY_RAIL_HOST_CLASS).not.toMatch(/overflow-x-hidden/);
  });

  it("forbids trade wipe specialty class in trade-primary-tabs-classes", async () => {
    const { TRADE_PRIMARY_TAB_PILL_SHELL } = await import("@/lib/trade/ui/trade-primary-tabs-classes");
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).toBe("dibay-secondary-tab");
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).not.toContain("overflow-hidden");
  });
});
