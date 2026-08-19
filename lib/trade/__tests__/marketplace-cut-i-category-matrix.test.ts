import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRADE_SEED_COMPOSITIONS,
  compositionFieldsForSurface,
  resolveCompositionAttributeFilterFields,
  resolveTradeComposition,
} from "@/lib/trade/category-form";
import type { TradeCompositionProfileId } from "@/lib/trade/category-form/types";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

const PROFILES: TradeCompositionProfileId[] = [
  "general",
  "used-car",
  "real-estate",
  "jobs",
  "exchange",
  "rent-car",
];

describe("CUT I — 6-profile WRITE/LIST/DETAIL/FILTER matrix (contract)", () => {
  it("seeds stay exactly six profiles", () => {
    expect(Object.keys(TRADE_SEED_COMPOSITIONS).sort()).toEqual([...PROFILES].sort());
  });

  it.each(PROFILES)("%s: write/list/detail/edit/filter resolve from seed", (profileId) => {
    const composition = resolveTradeComposition({ icon_key: profileId, fieldComposition: null });
    expect(composition.profileId).toBe(profileId);
    for (const surface of ["write", "list", "detail", "edit", "filter"] as const) {
      expect(compositionFieldsForSurface(composition, surface).length, `${profileId}.${surface}`).toBeGreaterThan(
        0
      );
    }
  });

  it("used-car / jobs / exchange expose composition attribute FILTER; general does not invent SUV-as-child", () => {
    const used = resolveTradeComposition({ icon_key: "used-car" });
    const jobs = resolveTradeComposition({ icon_key: "jobs" });
    const exchange = resolveTradeComposition({ icon_key: "exchange" });
    const general = resolveTradeComposition({ icon_key: "general" });
    expect(resolveCompositionAttributeFilterFields(used).map((f) => f.id)).toContain("body_type");
    expect(resolveCompositionAttributeFilterFields(jobs).length).toBeGreaterThan(0);
    expect(resolveCompositionAttributeFilterFields(exchange).length).toBeGreaterThan(0);
    expect(resolveCompositionAttributeFilterFields(general)).toEqual([]);
  });

  it("FILTER UI is MarketFilterSheet + SEARCH, not HOME or category list inline", () => {
    const home = readRepoFile("components/home/HomeProductList.tsx");
    const category = readRepoFile("components/post/PostListByCategory.tsx");
    const sheet = readRepoFile("components/trade/MarketFilterSheet.tsx");
    const search = readRepoFile("components/search/SearchFilterBar.tsx");
    expect(home).not.toContain("CompositionAttributeFilterSelects");
    expect(category).not.toContain("CompositionAttributeFilterSelects");
    expect(sheet).toContain("CompositionAttributeFilterSelects");
    expect(search).toContain("CompositionAttributeFilterSelects");
  });

  it("WRITE stays TradeCategoryWriteForm; no 7th WriteForm fork; used-car buy widget KEEP", () => {
    const writePage = readRepoFile("app/(main)/write/[categoryId]/page.tsx");
    const tradeWrite = readRepoFile("components/write/trade/TradeWriteForm.tsx");
    expect(writePage).toContain("TradeCategoryWriteForm");
    expect(writePage).not.toMatch(/RentCarWriteForm|UsedCarWriteForm|JobsWriteForm/);
    expect(tradeWrite).toContain("UsedCarBuyFields");
    expect(tradeWrite).toContain("UsedCarSellFields");
    expect(tradeWrite).toContain("filterTradePersistMetaByComposition");
    expect(fs.existsSync(path.join(REPO_ROOT, "components/write/trade/RentCarWriteForm.tsx"))).toBe(false);
  });

  it("does not reopen CUT A child option authority or CUT H home CTA", () => {
    const resolveFor = readRepoFile("lib/trade/category-form/resolve-for-category.ts");
    const home = readRepoFile("components/home/HomeProductList.tsx");
    expect(resolveFor).toContain("selectTradeCompositionOwnerRow");
    expect(home).toContain("countPendingNewHomeListings");
  });
});
