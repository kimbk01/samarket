/**
 * Owner SSOT (2026-10-16): default browse = LOCAL → NEARBY → NATIONWIDE, never region-only.
 * Exercised through the real supabase-js builder + in-memory PostgREST evaluator so the exact
 * filter strings (tier partitions, NULL handling) and pagination are checked.
 */
import { describe, expect, it } from "vitest";
import {
  resolveHomePostsPayload,
  resolveHomePostsStatusOrByTradeState,
  HOME_POSTS_PAGE_SIZE,
} from "@/lib/posts/home-posts-query-server";
import { fetchTradeFeedPage, TradeFeedQueryError } from "@/lib/posts/fetch-trade-feed-page";
import { PAGE_SIZE_TRADE_FEED } from "@/lib/posts/trade-posts-range-query";
import {
  buildTradeFeedLocationExcludeOrFilter,
  classifyListingBrowseTier,
  resolveBrowseLocationTiers,
  type BrowseLocationTier,
} from "@/lib/trade/location/national/browse-location-tiers";
import {
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { TRADE_BROWSE_NEARBY_TIER_RADIUS_KM } from "@/lib/trade/location/trade-browse-radius";
import {
  createFakePostgrestClient,
  rowMatchesSearchParams,
  type FakeRow,
} from "@/lib/posts/__tests__/helpers/fake-postgrest";

const QC = "1381300000"; // Quezon City — anchor
const MANILA = "1380600000"; // nearby (NCR)
const MAKATI = "1380300000"; // nearby (NCR)
const CEBU = "0730600000"; // outside (Visayas)
const CAT_A = "11111111-1111-4111-8111-111111111111";
const CAT_B = "22222222-2222-4222-8222-222222222222";

type Loc = { trade_lgu_id: string | null; region: string | null; city: string | null };
const LOCS: Array<{ loc: Loc; tier: BrowseLocationTier }> = [
  { loc: { trade_lgu_id: QC, region: null, city: null }, tier: "local" },
  { loc: { trade_lgu_id: null, region: "quezon", city: "q5" }, tier: "local" }, // legacy → QC
  { loc: { trade_lgu_id: MANILA, region: null, city: null }, tier: "nearby" },
  { loc: { trade_lgu_id: null, region: "manila", city: "m2" }, tier: "nearby" }, // legacy → Makati
  { loc: { trade_lgu_id: MAKATI, region: "quezon", city: "q5" }, tier: "nearby" }, // lgu wins over legacy
  { loc: { trade_lgu_id: CEBU, region: null, city: null }, tier: "outside" },
  { loc: { trade_lgu_id: null, region: "cebu", city: "c11" }, tier: "outside" },
  { loc: { trade_lgu_id: null, region: null, city: null }, tier: "outside" },
  { loc: { trade_lgu_id: null, region: "manila", city: null }, tier: "outside" },
  { loc: { trade_lgu_id: null, region: null, city: "q5" }, tier: "outside" },
];

function makeRows(n: number): FakeRow[] {
  const rows: FakeRow[] = [];
  const base = Date.parse("2026-10-01T00:00:00.000Z");
  for (let i = 0; i < n; i++) {
    const { loc } = LOCS[(i * 7) % LOCS.length];
    rows.push({
      id: `p${String(i).padStart(4, "0")}`,
      type: "trade",
      title: `item ${i}`,
      price: 100 + i,
      status: i % 17 === 0 ? "sold" : i % 19 === 0 ? "hidden" : "active",
      trade_category_id: i % 3 === 0 ? CAT_B : CAT_A,
      view_count: (i * 37) % 101,
      created_at: new Date(base + i * 60_000).toISOString(),
      user_id: "u1",
      ...loc,
    });
  }
  return rows;
}

const STATUS_OR = resolveHomePostsStatusOrByTradeState("latest");

function eligible(rows: FakeRow[], cats?: string[]): FakeRow[] {
  return rows.filter(
    (r) =>
      r.status !== "hidden" &&
      r.status !== "sold" &&
      r.trade_category_id != null &&
      (!cats || cats.includes(String(r.trade_category_id)))
  );
}

function expectedOrder(
  rows: FakeRow[],
  sort: "latest" | "popular",
  cats?: string[]
): string[] {
  const tiers = resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, null))!;
  const rank: Record<BrowseLocationTier, number> = { local: 0, nearby: 1, outside: 2 };
  return [...eligible(rows, cats)]
    .sort((a, b) => {
      const ta = rank[classifyListingBrowseTier(a as Loc, tiers)];
      const tb = rank[classifyListingBrowseTier(b as Loc, tiers)];
      if (ta !== tb) return ta - tb;
      if (sort === "popular" && a.view_count !== b.view_count) {
        return Number(b.view_count) - Number(a.view_count);
      }
      return String(b.created_at).localeCompare(String(a.created_at));
    })
    .map((r) => String(r.id));
}

async function collectAllPages(
  fetchPage: (from: number) => Promise<{ posts: { id: string }[]; hasMore: boolean } | null>,
  pageSize: number
): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 0; page < 50; page++) {
    const res = await fetchPage(page * pageSize);
    if (!res) throw new Error("page failed");
    ids.push(...res.posts.map((p) => p.id));
    if (!res.hasMore) return ids;
  }
  throw new Error("pagination did not terminate");
}

describe("browse location tiers — model", () => {
  const tiers = resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, null))!;

  it("nearby radius reuses the service recommended radius (no second distance policy)", () => {
    expect(tiers.nearbyRadiusKm).toBe(TRADE_BROWSE_NEARBY_TIER_RADIUS_KM);
    expect(tiers.nearby?.matchingCanonicalIds).toContain(MANILA);
    expect(tiers.nearby?.matchingCanonicalIds).toContain(MAKATI);
    expect(tiers.nearby?.matchingCanonicalIds).not.toContain(QC);
    expect(tiers.nearby?.matchingCanonicalIds).not.toContain(CEBU);
  });

  it("is only built for anchor + 거리 전체 (explicit radius / ALL keep their own contract)", () => {
    expect(resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, 32))).toBeNull();
    expect(resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(null, null))).toBeNull();
  });

  it("classifies local / nearby / outside (legacy region·city and NULL locations included)", () => {
    for (const { loc, tier } of LOCS) {
      expect(classifyListingBrowseTier(loc, tiers), JSON.stringify(loc)).toBe(tier);
    }
  });

  it("SQL exclude filter is the exact NULL-safe complement of the near tier", () => {
    const body = buildTradeFeedLocationExcludeOrFilter(tiers.near);
    for (const { loc } of LOCS) {
      const sp = new URLSearchParams();
      sp.set("or", `(${body})`);
      const sqlOutside = rowMatchesSearchParams(loc as FakeRow, sp);
      const jsNear = listingMatchesTradeFeedLocation(loc, tiers.near);
      expect(sqlOutside, JSON.stringify(loc)).toBe(!jsNear);
    }
  });
});

describe("HOME /api/philife/posts assembler — LOCAL → NEARBY → NATIONWIDE", () => {
  const rows = makeRows(240);

  for (const sort of ["latest", "popular"] as const) {
    it(`sort=${sort}: every page keeps tier order, no duplicate, no missing`, async () => {
      const sb = createFakePostgrestClient({ rows });
      const ids = await collectAllPages(
        (from) =>
          resolveHomePostsPayload(sb, null, from, sort, "trade", null, STATUS_OR, QC, null, {}),
        HOME_POSTS_PAGE_SIZE
      );
      const expected = expectedOrder(rows, sort);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expected);
      // nationwide rows are still shown (not a region-only list)
      const tiers = resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, null))!;
      const byId = new Map(rows.map((r) => [String(r.id), r]));
      const tierSeq = ids.map((id) => classifyListingBrowseTier(byId.get(id) as Loc, tiers));
      expect(tierSeq).toContain("outside");
      expect(tierSeq.indexOf("nearby")).toBeGreaterThan(tierSeq.lastIndexOf("local"));
      expect(tierSeq.indexOf("outside")).toBeGreaterThan(tierSeq.lastIndexOf("nearby"));
    });
  }

  it("category membership (M-HARD) + tiers: only member rows, same tier order", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = await collectAllPages(
      (from) =>
        resolveHomePostsPayload(sb, null, from, "latest", "trade", [CAT_B], STATUS_OR, QC, null, {}),
      HOME_POSTS_PAGE_SIZE
    );
    expect(ids).toEqual(expectedOrder(rows, "latest", [CAT_B]));
  });

  it("anchor with no local rows still lists nearby then nationwide", async () => {
    const noLocal = rows.filter(
      (r) => classifyListingBrowseTier(r as Loc, resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, null))!) !== "local"
    );
    const sb = createFakePostgrestClient({ rows: noLocal });
    const ids = await collectAllPages(
      (from) => resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, QC, null, {}),
      HOME_POSTS_PAGE_SIZE
    );
    expect(ids).toEqual(expectedOrder(noLocal, "latest"));
    expect(ids.length).toBe(eligible(noLocal).length);
  });

  it("explicit radius stays a hard boundary (only rows inside N km)", async () => {
    const sb = createFakePostgrestClient({ rows });
    const res = await resolveHomePostsPayload(sb, null, 0, "latest", "trade", null, STATUS_OR, QC, 5, {});
    const inside = resolveTradeFeedLocationConstraint(QC, 5);
    if (inside.kind !== "lgu") throw new Error("expected lgu");
    expect(res!.posts.length).toBeGreaterThan(0);
    for (const p of res!.posts) {
      expect(listingMatchesTradeFeedLocation(p as Loc, inside)).toBe(true);
    }
  });

  it("location=all (guest / no address): nationwide latest, no location priority", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = await collectAllPages(
      (from) => resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, null, null, {}),
      HOME_POSTS_PAGE_SIZE
    );
    const expected = eligible(rows)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => String(r.id));
    expect(ids).toEqual(expected);
  });

  it("DB failure in a tier query → null (never an empty list)", async () => {
    const sb = createFakePostgrestClient({
      rows,
      failWhen: (url) => (url.searchParams.getAll("or").join("|")).includes("not.in"),
    });
    const res = await resolveHomePostsPayload(sb, null, 100, "latest", "trade", null, STATUS_OR, QC, null, {});
    expect(res).toBeNull();
  });
});

describe("/api/trade/feed fetchTradeFeedPage", () => {
  const rows = makeRows(240);

  it("popular sort survives the L-SOFT delegate (was coerced to newest)", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = await collectAllPages(
      async (from) =>
        fetchTradeFeedPage(sb, [CAT_A, CAT_B], {
          page: from / PAGE_SIZE_TRADE_FEED + 1,
          sort: "popular",
          lguCityId: QC,
          statusOr: STATUS_OR,
        }),
      PAGE_SIZE_TRADE_FEED
    );
    expect(ids).toEqual(expectedOrder(rows, "popular"));
  });

  it("job feed keeps trade_type=job filter AND region tiers", async () => {
    const jobRows: FakeRow[] = rows.map((r, i) => ({ ...r, trade_type: i % 2 === 0 ? "job" : null }));
    const sb = createFakePostgrestClient({ rows: jobRows });
    const ids = await collectAllPages(
      async (from) =>
        fetchTradeFeedPage(sb, [CAT_A, CAT_B], {
          page: from / PAGE_SIZE_TRADE_FEED + 1,
          sort: "latest",
          lguCityId: QC,
          statusOr: STATUS_OR,
          restrictTradeTypeJob: true,
        }),
      PAGE_SIZE_TRADE_FEED
    );
    const expected = expectedOrder(jobRows.filter((r) => r.trade_type === "job"), "latest");
    expect(ids).toEqual(expected);
  });

  it("job hire/work kind filter + tiers (row-level meta filter across tiers)", async () => {
    const jobRows: FakeRow[] = rows.map((r, i) => ({
      ...r,
      trade_type: "job",
      meta: { listing_kind: i % 3 === 0 ? "work" : "hire" },
    }));
    const sb = createFakePostgrestClient({ rows: jobRows });
    const ids = await collectAllPages(
      async (from) =>
        fetchTradeFeedPage(sb, [CAT_A, CAT_B], {
          page: from / PAGE_SIZE_TRADE_FEED + 1,
          sort: "latest",
          lguCityId: QC,
          statusOr: STATUS_OR,
          restrictTradeTypeJob: true,
          jobsListingKind: "hire",
        }),
      PAGE_SIZE_TRADE_FEED
    );
    const byId = new Map(jobRows.map((r) => [String(r.id), r]));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect((byId.get(id)!.meta as { listing_kind: string }).listing_kind).toBe("hire");
    }
    expect(new Set(ids).size).toBe(ids.length);
    const tiers = resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, null))!;
    const rank = { local: 0, nearby: 1, outside: 2 } as const;
    const seq = ids.map((id) => rank[classifyListingBrowseTier(byId.get(id) as Loc, tiers)]);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
  });

  it("tier DB failure → TradeFeedQueryError (route answers 503, not empty)", async () => {
    const sb = createFakePostgrestClient({ rows, failWhen: () => true });
    await expect(
      fetchTradeFeedPage(sb, [CAT_A], { page: 1, sort: "latest", lguCityId: QC, statusOr: STATUS_OR })
    ).rejects.toBeInstanceOf(TradeFeedQueryError);
  });
});

describe("search (q) — tier order is global across pages, not per DB batch", () => {
  it("ranked window pages = one global ranking (band → LOCAL → NEARBY → NATIONWIDE), dup 0 / miss 0", async () => {
    const { resolveSearchExpansionRound } = await import("@/lib/posts/home-posts-query-server");
    const { takeSearchRankedWindowPage, resetSearchRankedWindowCacheForTests } = await import(
      "@/lib/trade/marketplace/search-ranked-window-cache"
    );
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const { rankMarketplaceDiscoveryBatch } = await import("@/lib/trade/marketplace/marketplace-discovery-rank");
    resetSearchRankedWindowCacheForTests();
    // newest rows are mostly outside → per-batch ranking would put them before older local rows
    const rows = makeRows(180).map((r, i) => ({ ...r, title: i % 2 === 0 ? `phone ${i}` : `chair ${i}` }));
    const categories = [
      { id: CAT_A, name: "general", slug: "general", type: "trade", is_active: true, parent_id: null, sort_order: 0, show_in_home_chips: true, icon_key: "general" },
      { id: CAT_B, name: "cars", slug: "cars", type: "trade", is_active: true, parent_id: null, sort_order: 1, show_in_home_chips: true, icon_key: "used-car" },
    ];
    const sb = createFakePostgrestClient({ rows, tables: { categories } });
    const discovery = await loadMarketplaceSearchDiscoveryContext(sb, null, "phone", null);
    expect(discovery).not.toBeNull();
    const extras = { q: "phone", searchDiscoveryContext: discovery };

    const ids: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await takeSearchRankedWindowPage({
        key: "search-global-test",
        page,
        pageSize: 50,
        loadNext: (cursor) =>
          resolveSearchExpansionRound(sb, null, "latest", "trade", null, STATUS_OR, QC, null, extras, cursor),
      });
      expect(res).not.toBeNull();
      ids.push(...res!.posts.map((p) => String(p.id)));
      if (!res!.hasMore) break;
    }

    const constraint = resolveTradeFeedLocationConstraint(QC, null);
    const expected = rankMarketplaceDiscoveryBatch({
      rows: eligible(rows).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) as never[],
      intent: discovery!.intent,
      rootExpandedIdsByParent: discovery!.rootExpandedIdsByParent,
      topicGraph: discovery!.topicGraph,
      feedConstraint: constraint,
      userSort: "latest",
    }).map((r) => String((r as { id: string }).id));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(eligible(rows).length);
    expect(ids).toEqual(expected);
  });

  it("a failed search fill is an error (null), not a truncated result", async () => {
    const { takeSearchRankedWindowPage, resetSearchRankedWindowCacheForTests } = await import(
      "@/lib/trade/marketplace/search-ranked-window-cache"
    );
    resetSearchRankedWindowCacheForTests();
    const res = await takeSearchRankedWindowPage({
      key: "search-fail-test",
      page: 1,
      pageSize: 50,
      loadNext: async () => null,
    });
    expect(res).toBeNull();
  });
});

describe("search ranked window memory bound", () => {
  it("total held rows stay within SEARCH_RANKED_WINDOW_ROW_BUDGET (oldest sessions evicted)", async () => {
    const m = await import("@/lib/trade/marketplace/search-ranked-window-cache");
    m.resetSearchRankedWindowCacheForTests();
    const big = Array.from({ length: 2000 }, (_, i) => ({ id: `r${i}` }));
    for (let k = 0; k < 30; k++) {
      const res = await m.takeSearchRankedWindowPage({
        key: `budget-${k}`,
        page: 1,
        pageSize: 50,
        loadNext: async () => ({
          posts: big,
          queryCount: 1,
          cursor: {
            ...(await import("@/lib/trade/marketplace/search-candidate-expansion")).emptySearchExpansionCursor(),
            exactExhausted: true,
            relatedInExhausted: true,
            relatedOutExhausted: true,
            tailExhausted: true,
          },
        }),
      });
      expect(res?.posts.length).toBe(50);
      expect(m.searchRankedWindowHeldRowsForTests()).toBeLessThanOrEqual(m.SEARCH_RANKED_WINDOW_ROW_BUDGET);
    }
    // newest session survives
    expect(m.peekSearchRankedWindowSession("budget-29")).not.toBeNull();
    m.resetSearchRankedWindowCacheForTests();
  });
});

describe("PostgREST max-rows cannot truncate a tier", () => {
  it("distance sort over a 1,500-row local tier with max-rows=1000 returns every row once", async () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const rows: FakeRow[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `big${String(i).padStart(5, "0")}`,
      type: "trade",
      status: "active",
      trade_category_id: CAT_A,
      view_count: i % 7,
      created_at: new Date(base + i * 1000).toISOString(),
      trade_lgu_id: QC,
      region: null,
      city: null,
    }));
    const sb = createFakePostgrestClient({ rows, maxRows: 1000 });
    const ids = await collectAllPages(
      (from) => resolveHomePostsPayload(sb, null, from, "distance", "trade", null, STATUS_OR, QC, null, {}),
      HOME_POSTS_PAGE_SIZE
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(1500);
  });
});
