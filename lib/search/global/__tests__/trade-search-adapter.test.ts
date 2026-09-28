import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchTradeForGlobal } from "@/lib/search/global/adapters/trade-search-adapter";
import { GLOBAL_SEARCH_TRADE_API_PATH } from "@/lib/search/global/trade-match-only";
import {
  inspectTradeTitleIlikeMatch,
  selectTitleIlikeMatched,
  tradePostFixture,
} from "@/lib/search/global/__tests__/trade-title-ilike-inspect";
import {
  assembleSearchExpansionRound,
  classifySearchExpansionTier,
  emptySearchExpansionCursor,
  resolveSearchExpansionHints,
  shouldApplyMarketplaceSearchExpansion,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import { marketplaceLocationFetchGate } from "@/lib/trade/marketplace/client-location-fetch";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import { createGlobalSearchCoordinator } from "@/lib/search/global/coordinate-search";

const PASIG = "1381200000";
const root = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const FORTUNER = tradePostFixture("fortuner", "Toyota Fortuner");
const FRIDGE = tradePostFixture("fridge", "Samsung fridge", { trade_lgu_id: PASIG });
const IPHONE = tradePostFixture("iphone-1", "아이폰 13 중고");
const KIMCHI = tradePostFixture("kimchi-1", "김치냉장고 300L");
const T2_ATTR = {
  id: "diesel-attr",
  title: "Diesel 2022",
  meta: { car_model: "Toyota Fortuner" },
  trade_lgu_id: PASIG,
};

describe("T-GS Global Search Trade match-only", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("T-GS1 Fortuner title match includes Toyota Fortuner and excludes Samsung fridge", async () => {
    const query = "Fortuner";
    const pool = [FORTUNER, FRIDGE];
    const matched = selectTitleIlikeMatched(query, pool);
    expect(inspectTradeTitleIlikeMatch(query, FORTUNER)).toMatchObject({
      QUERY: query,
      RESULT_ID: "fortuner",
      TITLE: "Toyota Fortuner",
      MATCH_FIELD: "title",
      MATCH_VALUE: "Toyota Fortuner",
    });
    expect(inspectTradeTitleIlikeMatch(query, FRIDGE)).toMatchObject({
      QUERY: query,
      RESULT_ID: "fridge",
      TITLE: "Samsung fridge",
      MATCH_FIELD: "NONE",
      MATCH_VALUE: "",
    });
    expect(matched.map((row) => row.id)).toEqual(["fortuner"]);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, posts: matched }),
    });
    const res = await searchTradeForGlobal(query, {
      signal: new AbortController().signal,
      canFetch: true,
      locationAll: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.products.map((p) => p.id)).toEqual(["fortuner"]);
    expect(res.products.some((p) => p.id === "fridge")).toBe(false);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain(GLOBAL_SEARCH_TRADE_API_PATH);
    expect(calledUrl).toContain("q=Fortuner");
    expect(calledUrl).toContain("location=all");
    expect(calledUrl).not.toContain("/api/philife/posts");
  });

  it("T-GS2 guaranteed no-match query returns []", async () => {
    const query = "zzzz_dibay_no_match_92837";
    expect(selectTitleIlikeMatched(query, [FORTUNER, FRIDGE, IPHONE, KIMCHI])).toEqual([]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, posts: [] }),
    });
    const res = await searchTradeForGlobal(query, {
      signal: new AbortController().signal,
      canFetch: true,
      locationAll: true,
    });
    expect(res).toEqual({ ok: true, products: [] });
  });

  it("T-GS3 아이폰 vs 김치 match sets do not share unmatched tail", () => {
    const q1Pool = [IPHONE, KIMCHI, FRIDGE];
    const q2Pool = [IPHONE, KIMCHI, FRIDGE];
    const q1 = selectTitleIlikeMatched("아이폰", q1Pool);
    const q2 = selectTitleIlikeMatched("김치", q2Pool);
    expect(q1.map((r) => r.id)).toEqual(["iphone-1"]);
    expect(q2.map((r) => r.id)).toEqual(["kimchi-1"]);
    const overlap = q1.filter((a) => q2.some((b) => b.id === a.id));
    expect(overlap).toEqual([]);
  });

  it("T-GS4 T5 unrelated latest product is not a Global Search match", () => {
    const query = "Fortuner";
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(classifySearchExpansionTier(FRIDGE, hints, PASIG)).toBeNull();
    const assembled = assembleSearchExpansionRound({
      exactRows: [],
      relatedInRows: [],
      relatedOutRows: [],
      tailRows: [
        {
          id: FRIDGE.id,
          title: FRIDGE.title,
          meta: {},
          trade_lgu_id: PASIG,
          created_at: FRIDGE.created_at,
        },
      ],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: emptySearchExpansionCursor(),
    });
    expect(assembled.posts.map((row) => row.id)).toEqual(["fridge"]);
    expect(inspectTradeTitleIlikeMatch(query, FRIDGE).MATCH_FIELD).toBe("NONE");
    expect(selectTitleIlikeMatched(query, assembled.posts as { id: string; title: string }[])).toEqual([]);
  });

  it("T-GS4 T2–T4 without title match are Marketplace-only, not Global Search", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(classifySearchExpansionTier(T2_ATTR, hints, PASIG)).toBe(2);
    expect(inspectTradeTitleIlikeMatch("Fortuner", T2_ATTR).MATCH_FIELD).toBe("NONE");
    expect(
      classifySearchExpansionTier(
        { title: "Montero Sport", meta: { car_body_type: "suv" }, trade_lgu_id: PASIG },
        hints,
        PASIG,
        ["suv"]
      )
    ).toBe(3);
    expect(inspectTradeTitleIlikeMatch("Fortuner", { id: "montero", title: "Montero Sport" }).MATCH_FIELD).toBe(
      "NONE"
    );
  });

  it("T-GS5 Marketplace CUT C expansion remains the /market?q= authority", () => {
    expect(shouldApplyMarketplaceSearchExpansion({ q: "Fortuner", sort: "latest" })).toBe(true);
    const home = read("lib/posts/home-posts-route-core.ts");
    expect(home).toContain("shouldApplyMarketplaceSearchExpansion");
    expect(home).toContain("takeSearchRankedWindowPage");
    const gsServer = read("lib/search/global/trade-match-only-server.ts");
    expect(gsServer).toContain("resolveHomePostsPayload");
    expect(gsServer).not.toContain("takeSearchRankedWindowPage");
    expect(gsServer).not.toContain("shouldApplyMarketplaceSearchExpansion");
    expect(gsServer).not.toContain("rankMarketplaceDiscoveryBatch");
    expect(gsServer).not.toContain("resolveSearchExpansionRound");
    expect(gsServer).not.toContain("applyTitleQuery: false");
  });

  it("T-GS6 location eligibility gate still blocks fetch when canFetch is false", async () => {
    const unset = marketplaceLocationFetchGate(parseTradeLocationScopeFromSearchParams(new URLSearchParams("")));
    expect(unset.canFetch).toBe(false);
    const res = await searchTradeForGlobal("Fortuner", {
      signal: new AbortController().signal,
      canFetch: unset.canFetch,
    });
    expect(res).toEqual({ ok: true, products: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    const all = marketplaceLocationFetchGate(
      parseTradeLocationScopeFromSearchParams(new URLSearchParams("location=all"))
    );
    expect(all.canFetch).toBe(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, posts: [FORTUNER] }),
    });
    await searchTradeForGlobal("Fortuner", {
      signal: new AbortController().signal,
      canFetch: all.canFetch,
      locationAll: all.locationAll,
      lguCityId: all.lguCityId ?? null,
      radiusKm: all.radiusKm ?? null,
    });
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("location=all");

    const city = marketplaceLocationFetchGate(
      parseTradeLocationScopeFromSearchParams(new URLSearchParams("location=city&lgu=pasig"))
    );
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, posts: [FORTUNER] }),
    });
    await searchTradeForGlobal("Fortuner", {
      signal: new AbortController().signal,
      canFetch: city.canFetch,
      locationAll: city.locationAll,
      lguCityId: city.lguCityId ?? null,
      radiusKm: city.radiusKm ?? null,
    });
    const cityUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(cityUrl).toContain("location=city");
    expect(cityUrl).toContain("lgu=pasig");
  });

  it("T-GS7 abort is rethrown and later seq remains current", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, posts: [FORTUNER] }),
      });
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      searchTradeForGlobal("Fortuner", {
        signal: aborted.signal,
        canFetch: true,
        locationAll: true,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    const coord = createGlobalSearchCoordinator();
    const first = coord.beginRequest();
    const second = coord.beginRequest();
    expect(coord.isCurrent(first.seq)).toBe(false);
    expect(coord.isCurrent(second.seq)).toBe(true);
    const live = new AbortController();
    const ok = await searchTradeForGlobal("Fortuner", {
      signal: live.signal,
      canFetch: true,
      locationAll: true,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.products.map((p) => p.id)).toEqual(["fortuner"]);
  });
});
