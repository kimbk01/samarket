import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMarketFilterDraftHref,
  buildMarketFilterOnlyResetHref,
} from "@/lib/trade/marketplace/marketplace-browse-state";
import { MARKETPLACE_LIST_CLIENT_PAGE_SIZE } from "@/lib/trade/marketplace/marketplace-list-pagination";
import { TRADE_CHAT_LIST_PAGE_SIZE } from "@/lib/community-messenger/trade-chat-list/trade-chat-list-pagination";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("marketplace browse SSOT wiring contract", () => {
  it("S1 — HomeProductList does not use peekRecentHomePostsFallback", () => {
    const src = read("components/home/HomeProductList.tsx");
    expect(src).not.toContain("peekRecentHomePostsFallback");
    expect(src).toContain("getHomePostsBrowseCacheKey");
    expect(src).toContain("replaceList");
  });

  it("S1 — reset handler does not call load() directly", () => {
    const src = read("components/home/HomeProductList.tsx");
    const resetBlock = src.slice(src.indexOf("MARKETPLACE_BROWSE_RESET_EVENT"));
    expect(resetBlock).not.toMatch(/onReset[\s\S]{0,400}void load\(/);
  });

  it("F1 — filter apply preserves city + radius when price changes", () => {
    const href = buildMarketFilterDraftHref({
      committedSearch: "location=city&lgu=pasig&radius=10&priceMin=1",
      knownCompositionFieldIds: [],
      rootCategory: null,
      draft: {
        sort: "latest",
        tradeState: "all",
        priceMin: "500",
        priceMax: "",
        rootCategoryId: null,
        rootCategoryIds: [],
        topicKey: null,
        topicByRoot: {},
        filters: {},
        location: {
          regionMode: "commit",
          distanceAll: false,
          radiusKm: 10,
          otherCityCanonicalId: null,
        },
      },
    });
    const sp = new URLSearchParams(href.split("?")[1] ?? "");
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBe("pasig");
    expect(sp.get("radius")).toBe("10");
    expect(sp.get("priceMin")).toBe("500");
  });

  it("L5 — hydrate does not silent ALL on master LGU fail", () => {
    const hydrate = read("lib/trade/location/use-trade-marketplace-location-hydrate.ts");
    expect(hydrate).toContain("resolveTradeMarketplaceMasterHydrateScope");
    expect(hydrate).not.toMatch(/masterCity\s*\?\?\s*\{\s*mode:\s*"all"\s*\}/);
    const resolver = read("lib/trade/location/resolve-trade-marketplace-default-city.ts");
    expect(resolver).toContain("master_lgu_unresolved");
  });

  it("R1 — filter-only reset keeps q, location, category", () => {
    const href = buildMarketFilterOnlyResetHref({
      baseSearch:
        "q=test&location=city&lgu=pasig&category=used-car&priceMin=1&tradeState=active&sort=popular",
      knownCompositionFieldIds: [],
    });
    const sp = new URLSearchParams(href.split("?")[1] ?? "");
    expect(sp.get("q")).toBe("test");
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBe("pasig");
    expect(sp.get("category")).toBe("used-car");
    expect(sp.get("priceMin")).toBeNull();
    expect(sp.get("tradeState")).toBeNull();
  });

  it("R1 — filter sheet uses filter-only reset not CLASS A", () => {
    const sheet = read("components/trade/MarketFilterSheet.tsx");
    expect(sheet).toContain("buildMarketFilterOnlyResetHref");
    expect(sheet).not.toContain("buildMarketplaceBrowseResetCommittedHref");
  });

  it("pagination — marketplace 16, chat 15 unchanged", () => {
    expect(MARKETPLACE_LIST_CLIENT_PAGE_SIZE).toBe(16);
    expect(TRADE_CHAT_LIST_PAGE_SIZE).toBe(15);
    const list = read("components/home/HomeProductList.tsx");
    expect(list).toContain("MARKETPLACE_LIST_CLIENT_PAGE_SIZE");
    expect(list).not.toContain("TRADE_CHAT_LIST_PAGE_SIZE");
  });

  it("invalid header — not displayed as 전체", () => {
    const pin = read("components/trade/TradeHeaderLocationPinButton.tsx");
    expect(pin).toContain('"invalid"');
    expect(pin).toContain("trade_location_invalid");
  });
});
