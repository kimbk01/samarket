/**
 * Device-evidence contracts (Samsung Production FAIL → local cutover must hold).
 * MAIN HUB left · PRIMARY shared pill · trade titles non-dibaY.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import {
  DIBAY_SECONDARY_TAB_ACTIVE_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import { TRADE_PRIMARY_TAB_PILL_SHELL, tradePrimaryTabClass } from "@/lib/trade/ui/trade-primary-tabs-classes";

const root = process.cwd();

describe("dibay chrome device-evidence contract", () => {
  it("MAIN HUB RegionBarMainHubTier1 locks left titleAlign (no DetailHeader)", () => {
    const src = readFileSync(join(root, "components/layout/RegionBarMainHubTier1.tsx"), "utf8");
    expect(src).toMatch(/titleAlign=["']left["']/);
    expect(src).toMatch(/SectionHeader/);
    expect(src).not.toMatch(/DetailHeader/);
    expect(src).not.toMatch(/titleAlign=["']center["']/);
  });

  it("PRIMARY Trade uses shared dibay secondary pills (no wipe specialty)", () => {
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).toBe("dibay-secondary-tab");
    expect(tradePrimaryTabClass(true)).toBe(DIBAY_SECONDARY_TAB_ACTIVE_CLASS);
    expect(tradePrimaryTabClass(false)).toBe(dibaySecondaryTabClass(false));
    expect(DIBAY_SECONDARY_TABS_CLASS).toBe("dibay-secondary-tabs");
    const css = readFileSync(join(root, "app/dibay-chrome-ssot.css"), "utf8");
    expect(css).toMatch(/--dibay-secondary-tab-item-h:\s*36px/);
    expect(css).toMatch(/--dibay-secondary-tab-row-h:\s*44px/);
    expect(css).toMatch(/\.dibay-secondary-tab--active/);
    const tradeTabs = readFileSync(join(root, "components/trade/TradePrimaryTabs.tsx"), "utf8");
    expect(tradeTabs).not.toMatch(/APP_MAIN_HEADER_INNER_CLASS/);
    expect(tradeTabs).toMatch(/tradePrimaryTabClass/);
  });

  it("Chat PRIMARY MessengerHomeSectionTabs uses shared dibay secondary", () => {
    const src = readFileSync(join(root, "components/community-messenger/MessengerHomeSectionTabs.tsx"), "utf8");
    expect(src).toMatch(/DibaySecondaryTabRow/);
    expect(src).toMatch(/dibaySecondaryTabClass/);
    const row = readFileSync(join(root, "components/ui/DibaySecondaryTabRow.tsx"), "utf8");
    expect(row).toMatch(/DIBAY_SECONDARY_TAB_TRACK_CLASS/);
    expect(row).toMatch(/data-dibay-nav/);
  });

  it("trade subroute titles never resolve to dibaY", () => {
    for (const p of [
      "/mypage/trade",
      "/mypage/trade/sales",
      "/mypage/trade/purchases",
      "/mypage/trade/favorites",
      "/mypage/trade/reviews",
    ]) {
      const r = resolveMainTier1Subpage(p);
      expect(r?.titleText).toBeTruthy();
      expect(r?.titleText).not.toBe("dibaY");
    }
    expect(resolveMainTier1Subpage("")?.titleText).not.toBe("dibaY");
    const resolveSrc = readFileSync(join(root, "lib/layout/resolve-main-tier1.ts"), "utf8");
    expect(resolveSrc).not.toMatch(/titleText:\s*["']dibaY["']/);
  });
});
