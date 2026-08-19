import { describe, expect, it } from "vitest";
import {
  buildMarketFilterDraftHref,
  buildMarketFilterOnlyResetHref,
  marketplaceBrowseStateIdentityEquals,
  parseMarketplaceBrowseStateFromSearchParams,
  serializeMarketFilterDraftToSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";

describe("marketplace browse state SSOT", () => {
  it("parse preserves q and city location from URL", () => {
    const state = parseMarketplaceBrowseStateFromSearchParams(
      new URLSearchParams("q=bike&location=city&lgu=pasig&priceMin=100")
    );
    expect(state.q).toBe("bike");
    expect(state.locationScope.mode).toBe("city");
    if (state.locationScope.mode === "city") {
      expect(state.locationScope.lguId).toBe("pasig");
    }
    expect(state.priceMin).toBe(100);
  });

  it("filter draft apply preserves q and city when only price changes", () => {
    const base =
      "q=samsung&location=city&lgu=pasig&sort=popular&priceMin=10&category=used-car";
    const sp = serializeMarketFilterDraftToSearchParams({
      committedSearch: base,
      knownCompositionFieldIds: [],
      rootCategory: null,
      draft: {
        sort: "latest",
        tradeState: "all",
        priceMin: "500",
        priceMax: "",
        rootCategoryId: "used-car",
        rootCategoryIds: ["used-car"],
        topicKey: null,
        topicByRoot: {},
        filters: {},
        location: {
          regionMode: "commit",
          distanceAll: true,
          radiusKm: 10,
          otherCityCanonicalId: null,
        },
      },
    });
    expect(sp.get("q")).toBe("samsung");
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBe("pasig");
    expect(sp.get("priceMin")).toBe("500");
    expect(sp.get("category")).toBe("used-car");
  });

  it("filter draft does not drop unset location axis", () => {
    const sp = serializeMarketFilterDraftToSearchParams({
      committedSearch: "q=test&priceMin=1",
      knownCompositionFieldIds: [],
      rootCategory: null,
      draft: {
        sort: "latest",
        tradeState: "all",
        priceMin: "2",
        priceMax: "",
        rootCategoryId: null,
        rootCategoryIds: [],
        topicKey: null,
        topicByRoot: {},
        filters: {},
        location: {
          regionMode: "commit",
          distanceAll: true,
          radiusKm: 10,
          otherCityCanonicalId: null,
        },
      },
    });
    expect(sp.get("q")).toBe("test");
    expect(sp.get("location")).toBeNull();
  });

  it("filter-only reset keeps q, location, and category", () => {
    const href = buildMarketFilterOnlyResetHref({
      baseSearch:
        "q=phone&location=city&lgu=pasig&category=general&priceMin=1&sort=popular&filters[make]=toyota",
      knownCompositionFieldIds: ["make"],
    });
    const sp = new URLSearchParams(href.split("?")[1] ?? "");
    expect(sp.get("q")).toBe("phone");
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBe("pasig");
    expect(sp.get("category")).toBe("general");
    expect(sp.get("priceMin")).toBeNull();
    expect(sp.get("sort")).toBeNull();
    expect(sp.get("filters[make]")).toBeNull();
  });

  it("browse identity changes when q changes", () => {
    const a = parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams("q=a&location=all"));
    const b = parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams("q=b&location=all"));
    expect(marketplaceBrowseStateIdentityEquals(a, b)).toBe(false);
  });

  it("buildMarketFilterDraftHref returns /market path", () => {
    const href = buildMarketFilterDraftHref({
      committedSearch: "location=all",
      knownCompositionFieldIds: [],
      rootCategory: null,
      draft: {
        sort: "latest",
        tradeState: "all",
        priceMin: "",
        priceMax: "",
        rootCategoryId: null,
        rootCategoryIds: [],
        topicKey: null,
        topicByRoot: {},
        filters: {},
        location: { regionMode: "all", distanceAll: true, radiusKm: 10, otherCityCanonicalId: null },
      },
    });
    expect(href.startsWith("/market")).toBe(true);
  });
});
