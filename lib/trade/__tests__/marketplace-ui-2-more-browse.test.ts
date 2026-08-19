import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import { resolveCompositionAttributeFilterFields } from "@/lib/trade/category-form/composition-filter-query";
import {
  advanceMarketplaceMoreBrowseStep,
  buildMarketplaceMoreBrowseHref,
  marketplaceMoreBrowseFilterFieldIds,
  retreatMarketplaceMoreBrowseStep,
} from "@/lib/trade/tabs/marketplace-more-browse";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Marketplace UI-2 more browse", () => {
  it("keeps location, q, price, status, sort and replaces category/topic/filters", () => {
    const href = buildMarketplaceMoreBrowseHref({
      categoryId: "used-car-root",
      topic: "sedan",
      filters: { body_type: "suv" },
      baseSearch:
        "location=city&lgu=mandaluyong&radius=64&q=Toyota&priceMin=1000&sort=distance&fs=latest&tradeState=active&page=3&filters[make]=toyota",
    });
    const sp = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBe("mandaluyong");
    expect(sp.get("radius")).toBe("64");
    expect(sp.get("q")).toBe("Toyota");
    expect(sp.get("priceMin")).toBe("1000");
    expect(sp.get("sort")).toBe("distance");
    expect(sp.get("fs")).toBe("latest");
    expect(sp.get("tradeState")).toBe("active");
    expect(sp.get("category")).toBe("used-car-root");
    expect(sp.get("topic")).toBe("sedan");
    expect(sp.get("filters[body_type]")).toBe("suv");
    expect(sp.get("filters[make]")).toBeNull();
    expect(sp.get("page")).toBeNull();
  });

  it("drops q only for 전체, not for 더보기 apply with category", () => {
    const href = buildMarketplaceMoreBrowseHref({
      categoryId: "jobs-root",
      baseSearch: "q=nurse&lgu=pasig",
    });
    const sp = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(sp.get("q")).toBe("nurse");
    expect(sp.get("lgu")).toBe("pasig");
    expect(sp.get("category")).toBe("jobs-root");
    expect(sp.get("topic")).toBeNull();
  });

  it("options are FILTER-surface select/catalog only", () => {
    const used = resolveTradeComposition({ icon_key: "used-car" });
    const ids = resolveCompositionAttributeFilterFields(used).map((f) => f.id);
    expect(ids).toEqual(
      marketplaceMoreBrowseFilterFieldIds({
        icon_key: "used-car",
        slug: "used-car",
        settings: null,
      })
    );
    expect(ids).toContain("body_type");
    expect(ids).not.toContain("mileage");
    expect(ids).not.toContain("title");
    expect(ids).not.toContain("price");
    const sheet = read("components/trade/MarketplaceMoreBrowseSheet.tsx");
    expect(sheet).toContain("resolveCompositionAttributeFilterFields");
    expect(sheet).toContain("CompositionAttributeFilterSelects");
    expect(sheet).not.toContain("composition.fields.map");
  });

  it("skips empty category and option steps", () => {
    expect(
      advanceMarketplaceMoreBrowseStep({
        from: "topic",
        childCount: 0,
        hasFilterOptions: false,
      })
    ).toBe("topic");
    expect(
      advanceMarketplaceMoreBrowseStep({
        from: "topic",
        childCount: 2,
        hasFilterOptions: true,
      })
    ).toBe("category");
    expect(
      advanceMarketplaceMoreBrowseStep({
        from: "topic",
        childCount: 0,
        hasFilterOptions: true,
      })
    ).toBe("options");
    expect(
      advanceMarketplaceMoreBrowseStep({
        from: "category",
        childCount: 2,
        hasFilterOptions: false,
      })
    ).toBe("category");
    expect(
      retreatMarketplaceMoreBrowseStep({ from: "options", childCount: 2 })
    ).toBe("category");
    expect(
      retreatMarketplaceMoreBrowseStep({ from: "options", childCount: 0 })
    ).toBe("topic");
  });

  it("does not mutate route until Apply and keeps UI-1 chrome", () => {
    const sheet = read("components/trade/MarketplaceMoreBrowseSheet.tsx");
    expect(sheet).toContain("onApply(href, root.id)");
    expect(sheet).not.toContain("router.push");
    expect(sheet).not.toContain("router.replace");
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).toContain("MarketplaceMoreBrowseSheet");
    expect(tabs).toContain("commitTab(href, tabKey)");
    expect(tabs).toContain("marketplace_filter_button");
    expect(tabs).toContain("data-marketplace-filter");
    expect(tabs).toContain("MarketFilterSheet");
    expect(tabs).not.toContain("DibayActionSheet");
  });
});
