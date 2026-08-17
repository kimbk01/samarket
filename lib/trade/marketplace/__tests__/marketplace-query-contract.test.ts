import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMarketplaceQueryToPostgrest,
  marketplaceQueryCacheSegment,
  parseMarketplacePriceBound,
  parseMarketplaceSort,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import {
  peekTradeBrowseCommittedScope,
  writeTradeBrowseCommittedScope,
} from "@/lib/trade/location/trade-browse-committed-session";
import { marketplaceLocationFetchGate } from "@/lib/trade/marketplace/client-location-fetch";
import { sortListingsByLguDistance } from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";
import { getPostsForHome } from "@/lib/posts/getPostsForHome";

describe("marketplace query contract", () => {
  it("sanitizes title query and rejects empty", () => {
    expect(sanitizeMarketplaceQueryText("  honda%civic  ")).toBe("honda civic");
    expect(sanitizeMarketplaceQueryText("   ")).toBeUndefined();
  });

  it("parses price bounds and sort", () => {
    expect(parseMarketplacePriceBound("1000")).toBe(1000);
    expect(parseMarketplacePriceBound("-1")).toBeUndefined();
    expect(parseMarketplaceSort("near")).toBe("distance");
    expect(parseMarketplaceSort("latest")).toBe("newest");
  });

  it("cache segment includes q/price/sort", () => {
    expect(
      marketplaceQueryCacheSegment({ q: "bike", priceMin: 10, priceMax: 50, sort: "distance" })
    ).toBe("q:bike:pmin:10:pmax:50:ms:distance");
  });

  it("applies title ilike and price gte/lte", () => {
    const calls: string[] = [];
    const q = {
      ilike(column: string, pattern: string) {
        calls.push(`ilike:${column}:${pattern}`);
        return this;
      },
      gte(column: string, value: number) {
        calls.push(`gte:${column}:${value}`);
        return this;
      },
      lte(column: string, value: number) {
        calls.push(`lte:${column}:${value}`);
        return this;
      },
    };
    applyMarketplaceQueryToPostgrest(q, { q: "sofa", priceMin: 100, priceMax: 500 });
    expect(calls).toEqual(["ilike:title:%sofa%", "gte:price:100", "lte:price:500"]);
  });
});

describe("marketplace location default", () => {
  it("empty URL is unset and must not fetch", () => {
    const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(""));
    expect(scope).toEqual({ mode: "unset" });
    expect(marketplaceLocationFetchGate(scope).canFetch).toBe(false);
  });

  it("explicit location=all may fetch nationwide", () => {
    const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams("location=all"));
    expect(scope).toEqual({ mode: "all" });
    expect(marketplaceLocationFetchGate(scope)).toEqual({ canFetch: true, locationAll: true });
  });
});

describe("trade browse committed session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips city and all", () => {
    const store = new Map<string, string>();
    const session = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("window", { sessionStorage: session });
    writeTradeBrowseCommittedScope({ mode: "all" });
    expect(peekTradeBrowseCommittedScope()).toEqual({ mode: "all" });
  });
});

describe("LGU centroid distance sort", () => {
  it("orders by centroid distance then created_at, not city string", () => {
    const pasig = "1381200000";
    const rows = [
      { id: "far", trade_lgu_id: "1130700000", created_at: "2026-08-17T10:00:00.000Z" },
      { id: "near", trade_lgu_id: pasig, created_at: "2026-08-16T10:00:00.000Z" },
    ];
    const sorted = sortListingsByLguDistance(rows, pasig);
    expect(sorted[0]?.id).toBe("near");
  });

  it("maps legacy region/city to centroid when trade_lgu_id is null", () => {
    const pasig = "1381200000";
    const rows = [
      {
        id: "far",
        trade_lgu_id: "1130700000",
        region: null,
        city: "aaaa",
        created_at: "2026-08-17T12:00:00.000Z",
      },
      {
        id: "legacy-near",
        trade_lgu_id: null,
        region: "manila",
        city: "m20",
        created_at: "2026-08-16T10:00:00.000Z",
      },
    ];
    const sorted = sortListingsByLguDistance(rows, pasig);
    expect(sorted.map((r) => r.id)).toEqual(["legacy-near", "far"]);
  });
});

describe("getPostsForHome location gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fetch nationwide when location is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await getPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    expect(res.posts).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
