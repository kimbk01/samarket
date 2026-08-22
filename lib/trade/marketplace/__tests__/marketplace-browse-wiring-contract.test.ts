import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMarketFilterDraftHref,
  buildMarketFilterOnlyResetHref,
  marketplaceBrowseStateIdentityKey,
  marketplaceBrowseStateToGetPostsForHomeOptions,
  parseMarketplaceBrowseStateFromSearchParams,
  parseMarketplaceRootCategoryIdsFromSearch,
  resolveMarketCategorySurfaceQuery,
} from "@/lib/trade/marketplace/marketplace-browse-state";
import { getHomePostsBrowseCacheKey } from "@/lib/posts/getPostsForHome";
import { MARKETPLACE_LIST_CLIENT_PAGE_SIZE } from "@/lib/trade/marketplace/marketplace-list-pagination";
import { TRADE_CHAT_LIST_PAGE_SIZE } from "@/lib/community-messenger/trade-chat-list/trade-chat-list-pagination";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const EXCHANGE_ROOT = "fa4af727-ec64-466e-b164-42368b839daf";
const USED_CAR_ROOT = "50feae02-9fb9-4b59-8ab7-7e43a0f5c407";

describe("marketplace browse SSOT wiring contract", () => {
  it("S1 — HomeProductList does not use peekRecentHomePostsFallback", () => {
    const src = read("components/home/HomeProductList.tsx");
    expect(src).not.toContain("peekRecentHomePostsFallback");
    expect(src).toContain("marketplaceBrowseStateIdentityKey");
    expect(src).toContain("replaceList");
  });

  it("S1 — reset handler clears posts and does not call load() directly", () => {
    const src = read("components/home/HomeProductList.tsx");
    const resetBlock = src.slice(src.indexOf("MARKETPLACE_BROWSE_RESET_EVENT"));
    expect(resetBlock).toContain("setPosts([])");
    expect(resetBlock).toContain("setFavoriteMap({})");
    expect(resetBlock).not.toMatch(/onReset[\s\S]{0,400}void load\(/);
  });

  it("SSOT-6 A — identity key drives fetch options cache segment", () => {
    const homeSp = new URLSearchParams("location=all");
    const exchangeSp = new URLSearchParams(`location=all&category=${EXCHANGE_ROOT}`);
    const homeState = parseMarketplaceBrowseStateFromSearchParams(homeSp);
    const exchangeState = parseMarketplaceBrowseStateFromSearchParams(exchangeSp);
    const homeKey = marketplaceBrowseStateIdentityKey(homeState);
    const exchangeKey = marketplaceBrowseStateIdentityKey(exchangeState);
    expect(homeKey).not.toBe(exchangeKey);

    const homeOpts = marketplaceBrowseStateToGetPostsForHomeOptions(homeState);
    const exchangeOpts = marketplaceBrowseStateToGetPostsForHomeOptions(exchangeState);
    expect(getHomePostsBrowseCacheKey(homeOpts)).not.toBe(getHomePostsBrowseCacheKey(exchangeOpts));
    expect(exchangeOpts.tradeMarketParentIds).toEqual([EXCHANGE_ROOT]);
    expect(homeOpts.tradeMarketParentIds).toBeNull();
  });

  it("SSOT-6 B — HOME vs ROOT identity keys differ (hard replace authority)", () => {
    const home = marketplaceBrowseStateIdentityKey(
      parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams("location=all"))
    );
    const exchange = marketplaceBrowseStateIdentityKey(
      parseMarketplaceBrowseStateFromSearchParams(
        new URLSearchParams(`location=all&category=${EXCHANGE_ROOT}`)
      )
    );
    expect(home).not.toBe(exchange);
  });

  it("SSOT-6 C — reset contract documents posts clear in HomeProductList", () => {
    const src = read("components/home/HomeProductList.tsx");
    expect(src).toContain("browseIdentityInitializedRef");
    expect(src).toContain('setListState("loading")');
  });

  it("SSOT-6 D — categoryIds-only surface matches fetch root", () => {
    const sp = new URLSearchParams(`categoryIds=${USED_CAR_ROOT}&location=all`);
    expect(parseMarketplaceRootCategoryIdsFromSearch(sp)).toEqual([USED_CAR_ROOT]);
    expect(resolveMarketCategorySurfaceQuery(sp)).toBe(USED_CAR_ROOT);
    const opts = marketplaceBrowseStateToGetPostsForHomeOptions(
      parseMarketplaceBrowseStateFromSearchParams(sp)
    );
    expect(opts.tradeMarketParentIds).toEqual([USED_CAR_ROOT]);
  });

  it("SSOT-6 D — category + categoryIds mismatch uses categoryIds authority", () => {
    const sp = new URLSearchParams(
      `category=${EXCHANGE_ROOT}&categoryIds=${USED_CAR_ROOT}&location=all`
    );
    expect(parseMarketplaceRootCategoryIdsFromSearch(sp)).toEqual([USED_CAR_ROOT]);
    expect(resolveMarketCategorySurfaceQuery(sp)).toBe(USED_CAR_ROOT);
    const opts = marketplaceBrowseStateToGetPostsForHomeOptions(
      parseMarketplaceBrowseStateFromSearchParams(sp)
    );
    expect(opts.tradeMarketParentIds).toEqual([USED_CAR_ROOT]);
  });

  it("SSOT-6 E — silent refresh guards identity in HomeProductList", () => {
    const src = read("components/home/HomeProductList.tsx");
    expect(src).toContain("patchHomeTradePostsInPlace");
    expect(src).toContain("browseIdentityPrevRef.current !== refreshIdentity");
  });

  it("SSOT-6 F — prewarm uses getPostsForHome + browse options", () => {
    const prewarm = read("lib/main-menu/bottom-nav-tap-prewarm-trade.ts");
    expect(prewarm).toContain("getPostsForHome");
    expect(prewarm).toContain("marketplaceBrowseStateToGetPostsForHomeOptions");
    expect(prewarm).not.toContain("getPostsByTradeCategoryIds");
  });

  it("SSOT-6 F — boot only when peek matches current options (HomeProductList)", () => {
    const src = read("components/home/HomeProductList.tsx");
    expect(src).toContain("peekCachedPostsForHome(homePostListOptions)");
    expect(src).not.toContain("browseCacheKeyRef");
  });

  it("SSOT-6 — MarketContent category fork uses resolveMarketCategorySurfaceQuery + pending intent", () => {
    const src = read("app/(main)/market/MarketContent.tsx");
    expect(src).toContain("resolveMarketCategorySurfaceQuery");
    expect(src).toContain("pendingMenuIntent");
    expect(src).toContain("prewarmBottomNavMarketTab");
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

  it("L5 — unset hydrate uses address-book master CITY before reset; no force refresh", () => {
    const hydrate = read("lib/trade/location/use-trade-marketplace-location-hydrate.ts");
    expect(hydrate).toContain("resolveTradeMarketplaceMasterHydrateScope");
    expect(hydrate).toContain("tradeMarketplaceCityScopeFromMasterAddress");
    const seedAt = hydrate.indexOf("peekMasterCityScopeFromAddressCache");
    const resetCallAt = hydrate.lastIndexOf("resolveTradeMarketplaceMasterAddressResetHref");
    expect(seedAt).toBeGreaterThan(0);
    expect(seedAt).toBeLessThan(resetCallAt);
    expect(hydrate).not.toContain("forceAddressRefresh");
    const resolver = read("lib/trade/location/resolve-trade-marketplace-default-city.ts");
    expect(resolver).toContain("resolveTradeLguCityFromInternal");
    expect(resolver).not.toContain("MASTER_LGU_UNRESOLVED");
    expect(resolver).toContain("tradeMarketplaceHydrateScopeBeforeMasterResolution");
  });

  it("GUEST-1 — guest hydrate uses confirmed guest proof, not blind 401 → ALL", () => {
    const ssot = read("lib/trade/location/trade-marketplace-address-defaults-hydrate-scope.ts");
    expect(ssot).toContain("canCommitTradeGuestNationwideAllFromAddressDefaults");
    expect(ssot).toContain("isRecoverableGuestAuthEstablished");
    expect(ssot).toContain('boot.status === "anonymous"');
    expect(ssot).toContain("dibay-marketplace-trade-guest-location-hard-lock");
    const resolver = read("lib/trade/location/resolve-trade-marketplace-default-city.ts");
    expect(resolver).toContain("tradeMarketplaceHydrateScopeBeforeMasterResolution");
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
