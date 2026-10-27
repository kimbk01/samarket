/**
 * 거래 목록 계약 (Owner 2026-10-27, `docs/dibay-marketplace-list-ssot-target.md`):
 * 어떤 조건도 글을 숨기지 않는다 — 거래 상태(판매중 → 판매완료) → 지역(LOCAL → NEARBY → NATIONWIDE) → 정렬.
 * 거리 숫자도 순서만(반경 안 → 주변 → 그 외). 검색은 일치 단계 → 같은 구간 → 나머지 전체.
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
  resolveBrowseLocationTiersForRadius,
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

/** 공개 자격(숨김 제외·거래 글) — 판매완료도 목록에 나온다 */
function eligible(rows: FakeRow[], cats?: string[]): FakeRow[] {
  return rows.filter(
    (r) =>
      r.status !== "hidden" &&
      r.trade_category_id != null &&
      (!cats || cats.includes(String(r.trade_category_id)))
  );
}

const soldRank = (r: FakeRow) => (r.status === "sold" ? 1 : 0);

function expectedOrder(
  rows: FakeRow[],
  sort: "latest" | "popular",
  cats?: string[],
  radiusKm: number | null = null
): string[] {
  const constraint = resolveTradeFeedLocationConstraint(QC, radiusKm);
  const tiers =
    radiusKm == null ? resolveBrowseLocationTiers(constraint)! : resolveBrowseLocationTiersForRadius(constraint)!;
  const rank: Record<BrowseLocationTier, number> = { local: 0, nearby: 1, outside: 2 };
  return [...eligible(rows, cats)]
    .sort((a, b) => {
      if (soldRank(a) !== soldRank(b)) return soldRank(a) - soldRank(b);
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

  it("거리 「전체」 tier 와 거리 숫자 tier 는 각자 함수(ALL 은 tier 없음)", () => {
    expect(resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, 32))).toBeNull();
    expect(resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(null, null))).toBeNull();
    const r = resolveBrowseLocationTiersForRadius(resolveTradeFeedLocationConstraint(QC, 5))!;
    expect(r.local.matchingCanonicalIds).toContain(QC);
    expect(r.nearby?.matchingCanonicalIds ?? []).not.toContain(QC);
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
      const activeTiers = ids
        .filter((id) => byId.get(id)?.status !== "sold")
        .map((id) => classifyListingBrowseTier(byId.get(id) as Loc, tiers));
      expect(activeTiers.indexOf("nearby")).toBeGreaterThan(activeTiers.lastIndexOf("local"));
      expect(activeTiers.indexOf("outside")).toBeGreaterThan(activeTiers.lastIndexOf("nearby"));
      // 판매완료는 모두 판매중 뒤
      const firstSold = ids.findIndex((id) => byId.get(id)?.status === "sold");
      expect(firstSold).toBeGreaterThan(0);
      expect(ids.slice(firstSold).every((id) => byId.get(id)?.status === "sold")).toBe(true);
    });
  }

  it("전체 대상(HOME 거래 합집합) id 는 그 범위만 — 같은 상태·지역 순서", async () => {
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

  it("거리 숫자(5km)도 순서만 — 반경 안 → 주변 → 그 외, 전체가 나온다 (2026-10-27 계약)", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = await collectAllPages(
      (from) => resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, QC, 5, {}),
      HOME_POSTS_PAGE_SIZE
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expectedOrder(rows, "latest", undefined, 5));
    expect(ids.length).toBe(eligible(rows).length);
  });

  it("location=all (guest / no address): nationwide latest, no location priority", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = await collectAllPages(
      (from) => resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, null, null, {}),
      HOME_POSTS_PAGE_SIZE
    );
    const expected = eligible(rows)
      .sort(
        (a, b) => soldRank(a) - soldRank(b) || String(b.created_at).localeCompare(String(a.created_at))
      )
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
    /** 목록 계약 §6: 일자리 전용 목록은 기존 전용 경로(판매중만, 지역 tier) 유지 */
    const expected = expectedOrder(
      jobRows.filter((r) => r.trade_type === "job" && r.status !== "sold"),
      "latest"
    );
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
    const { rankMarketplaceDiscoveryBatch, classifyDiscoveryBand } = await import(
      "@/lib/trade/marketplace/marketplace-discovery-rank"
    );
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

    /** 2026-10-27 계약: 일치 단계(0–4) → 상태 → 지역 → 최신, 그다음 나머지(5)도 같은 구간 순서로 전부 */
    const tiers = resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(QC, null))!;
    const rank: Record<BrowseLocationTier, number> = { local: 0, nearby: 1, outside: 2 };
    const bandOf = (r: FakeRow) =>
      classifyDiscoveryBand(r as never, discovery!.intent, discovery!.rootExpandedIdsByParent, discovery!.topicGraph, []);
    const expected = eligible(rows)
      .sort((a, b) => {
        const ba = bandOf(a);
        const bb = bandOf(b);
        if (ba !== bb) return ba - bb;
        if (soldRank(a) !== soldRank(b)) return soldRank(a) - soldRank(b);
        const ta = rank[classifyListingBrowseTier(a as Loc, tiers)];
        const tb = rank[classifyListingBrowseTier(b as Loc, tiers)];
        if (ta !== tb) return ta - tb;
        return String(b.created_at).localeCompare(String(a.created_at));
      })
      .map((r) => String(r.id));
    void rankMarketplaceDiscoveryBatch;

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expected);
    const titleById = new Map(rows.map((r) => [String((r as unknown as { id: string }).id), String(r.title)]));
    const firstRest = ids.findIndex((id) => !(titleById.get(id) ?? "").startsWith("phone"));
    expect(firstRest).toBeGreaterThan(0);
    expect(ids.slice(0, firstRest).every((id) => (titleById.get(id) ?? "").startsWith("phone"))).toBe(true);
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

describe("search page hydration (slim ranking rows → full rows for one page)", () => {
  it("keeps ranked order, drops rows deleted since ranking, null on DB failure", async () => {
    const { hydrateHomePostsByIds, MARKETPLACE_SEARCH_RANK_SELECT } = await import(
      "@/lib/posts/home-posts-query-server"
    );
    const rows = makeRows(30).map((r) => ({ ...r, images: [`https://img/${r.id}.jpg`] }));
    const log: URL[] = [];
    const sb = createFakePostgrestClient({ rows, log });
    const order = ["p0007", "p0002", "p9999", "p0011"];
    const out = await hydrateHomePostsByIds(sb, null, order);
    expect(out?.map((p) => p.id)).toEqual(["p0007", "p0002", "p0011"]);
    expect(out?.every((p) => Array.isArray(p.images) && p.images.length === 1)).toBe(true);
    expect(log.length).toBe(1);
    expect(log[0].searchParams.get("id")).toContain("in.(");

    const failing = createFakePostgrestClient({ rows, failWhen: () => true });
    expect(await hydrateHomePostsByIds(failing, null, order)).toBeNull();
    expect(MARKETPLACE_SEARCH_RANK_SELECT).not.toContain("images");
  });

  it("search pool request uses the slim column list", async () => {
    const { resolveSearchExpansionRound, MARKETPLACE_SEARCH_RANK_SELECT } = await import(
      "@/lib/posts/home-posts-query-server"
    );
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const { emptySearchExpansionCursor } = await import("@/lib/trade/marketplace/search-candidate-expansion");
    const rows = makeRows(40);
    const log: URL[] = [];
    const sb = createFakePostgrestClient({ rows, log, tables: { categories: [] } });
    const disc = await loadMarketplaceSearchDiscoveryContext(sb, null, "item", null);
    await resolveSearchExpansionRound(sb, null, "latest", "trade", null, STATUS_OR, QC, null, { q: "item", searchDiscoveryContext: disc }, emptySearchExpansionCursor());
    const poolReqs = log.filter((u) => /posts/.test(u.pathname));
    expect(poolReqs.length).toBeGreaterThan(0);
    for (const u of poolReqs) expect(u.searchParams.get("select")).toBe(MARKETPLACE_SEARCH_RANK_SELECT);
  });
});

describe("search step 2 — SQL candidate filter + lazy tail ≡ full-pool ranking", () => {
  const TITLES = [
    "Toyota Vios 2019 for sale",
    "selling  toyota   corolla",
    "아이폰 팝니다",
    "iPhone 13 pro 판매",
    "condo for rent Makati",
    "임대 콘도 마카티",
    "USD to PHP exchange",
    "페소 삽니다",
    "sofa chair",
    "Honda city sedan",
    "used laptop (good)",
    "bike, almost new",
  ];
  const METAS = [
    { car_model: "vios", car_body_type: "sedan", car_trade: "sell" },
    { car_model: "corolla altis", car_body_type: "sedan" },
    null,
    { exchange_direction: "buy" },
    { deal_type: "rent", estate_type: "condo" },
    { listing_kind: "hire", work_category: "it" },
    {},
  ];

  function searchRows(n: number): FakeRow[] {
    const base = Date.parse("2026-03-01T00:00:00.000Z");
    return Array.from({ length: n }, (_, i) => {
      const { loc } = LOCS[(i * 7) % LOCS.length];
      return {
        id: `s${String(i).padStart(5, "0")}`,
        type: "trade",
        title: `${TITLES[i % TITLES.length]} #${i}`,
        price: 100 + (i % 50),
        status: i % 23 === 0 ? "sold" : "active",
        trade_category_id: i % 3 === 0 ? CAT_B : CAT_A,
        view_count: (i * 37) % 97,
        created_at: new Date(base + i * 60_000).toISOString(),
        meta: METAS[i % METAS.length],
        ...loc,
      };
    });
  }

  const categories = [
    { id: CAT_A, name: "중고거래", name_en: "general", slug: "general", type: "trade", is_active: true, parent_id: null, sort_order: 0, show_in_home_chips: true, icon_key: "general" },
    { id: CAT_B, name: "중고차", name_en: "cars", slug: "vehicle", type: "trade", is_active: true, parent_id: null, sort_order: 1, show_in_home_chips: true, icon_key: "used-car" },
  ];

  async function runWindow(
    sb: ReturnType<typeof createFakePostgrestClient>,
    q: string,
    lgu: string | null,
    radius: number | null,
    sort: "latest" | "popular" | "distance",
    mode: "candidate" | "fullpool"
  ): Promise<string[]> {
    const { resolveSearchExpansionRound } = await import("@/lib/posts/home-posts-query-server");
    const { takeSearchRankedWindowPage, resetSearchRankedWindowCacheForTests } = await import(
      "@/lib/trade/marketplace/search-ranked-window-cache"
    );
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    resetSearchRankedWindowCacheForTests();
    const disc = await loadMarketplaceSearchDiscoveryContext(sb, null, q, null);
    const extras = { q, searchDiscoveryContext: disc, mixedDiscoverySellIntent: true };
    const ids: string[] = [];
    for (let page = 1; page <= 80; page++) {
      const res = await takeSearchRankedWindowPage({
        key: `eq-${mode}`,
        page,
        pageSize: 50,
        loadNext: (cursor) =>
          resolveSearchExpansionRound(
            sb, null, sort, "trade", null, STATUS_OR, lgu, radius, extras,
            mode === "fullpool" ? { ...cursor, searchMode: cursor.searchMode ?? "fullpool" } : cursor
          ),
      });
      if (!res) throw new Error(`window failed (${mode})`);
      ids.push(...res.posts.map((p) => String(p.id)));
      if (!res.hasMore) return ids;
    }
    throw new Error("did not terminate");
  }

  const rows = searchRows(1300);
  /** "a" / "임대": short-token queries — candidate path too (strongRelated vacuous rule fixed). */
  const QUERIES = ["toyota", "Toyota Vios", "팝니다", "sedan", "condo rent", "usd", "laptop (good)", "zzqx-nomatch", "a", "임대", "iphone 판매"];
  const LOCATIONS: Array<[string | null, number | null, string]> = [
    [QC, null, "QC 전체"],
    [QC, 32, "QC 32km"],
    [null, null, "ALL"],
  ];

  for (const q of QUERIES) {
    for (const [lgu, radius, label] of LOCATIONS) {
      for (const sort of ["latest", "popular", "distance"] as const) {
        it(`q="${q}" ${label} sort=${sort}: identical full sequence`, async () => {
          const sb = createFakePostgrestClient({ rows, tables: { categories }, maxRows: 1000 });
          const viaCandidate = await runWindow(sb, q, lgu, radius, sort, "candidate");
          const viaFullPool = await runWindow(sb, q, lgu, radius, sort, "fullpool");
          expect(new Set(viaCandidate).size).toBe(viaCandidate.length);
          expect(viaCandidate).toEqual(viaFullPool);
        });
      }
    }
  }

  it("candidate mode reads far fewer rows than the full pool for a selective query", async () => {
    const log: URL[] = [];
    const sb = createFakePostgrestClient({ rows, tables: { categories }, maxRows: 1000, log });
    const { resolveSearchExpansionRound } = await import("@/lib/posts/home-posts-query-server");
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const { emptySearchExpansionCursor } = await import("@/lib/trade/marketplace/search-candidate-expansion");
    const disc = await loadMarketplaceSearchDiscoveryContext(sb, null, "condo rent", null);
    const first = await resolveSearchExpansionRound(
      sb, null, "latest", "trade", null, STATUS_OR, QC, null,
      { q: "condo rent", searchDiscoveryContext: disc }, emptySearchExpansionCursor()
    );
    expect(first?.cursor.searchMode).toBe("candidate");
    // first round returns only matches, not the 1,300-row universe
    expect(first!.posts.length).toBeLessThan(400);
    expect(first!.posts.length).toBeGreaterThan(0);
  });
});

describe("search step 2 — safe when search_text is not migrated", () => {
  it("candidate query failure falls back to the full-pool path (same results, no error)", async () => {
    const { resolveSearchExpansionRound } = await import("@/lib/posts/home-posts-query-server");
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const { emptySearchExpansionCursor } = await import("@/lib/trade/marketplace/search-candidate-expansion");
    const rows = makeRows(120).map((r, i) => ({ ...r, title: i % 4 === 0 ? `toyota ${i}` : `chair ${i}` }));
    const noColumn = createFakePostgrestClient({
      rows,
      tables: { categories: [] },
      failWhen: (u) => u.search.includes("search_text"),
    });
    const disc = await loadMarketplaceSearchDiscoveryContext(noColumn, null, "toyota", null);
    const res = await resolveSearchExpansionRound(
      noColumn, null, "latest", "trade", null, STATUS_OR, QC, null,
      { q: "toyota", searchDiscoveryContext: disc }, emptySearchExpansionCursor()
    );
    expect(res).not.toBeNull();
    expect(res!.cursor.searchMode).toBe("fullpool");
    /** 2026-10-27 계약: 일치(toyota) 먼저, 그다음 나머지(chair)까지 전부 */
    expect(res!.posts.length).toBe(eligible(rows).length);
    const firstRest = res!.posts.findIndex((p) => !String(p.title).startsWith("toyota"));
    expect(firstRest).toBe(eligible(rows).filter((r) => String(r.title).startsWith("toyota")).length);
  });
});

describe("strongRelated — short queries no longer make every listing 'related'", () => {
  it("「임대」: title match = band 1, unrelated listing = band 5 (tail), candidate path used", async () => {
    const { classifyDiscoveryBand } = await import("@/lib/trade/marketplace/marketplace-discovery-rank");
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const { buildSearchCandidateSqlFilter } = await import("@/lib/trade/marketplace/search-candidate-sql");
    const sb = createFakePostgrestClient({ rows: [], tables: { categories: [] } });
    const disc = (await loadMarketplaceSearchDiscoveryContext(sb, null, "임대", null))!;
    const band = (title: string, meta: Record<string, unknown> | null = null) =>
      classifyDiscoveryBand(
        { id: "x", title, trade_category_id: CAT_A, meta } as never,
        disc.intent,
        disc.rootExpandedIdsByParent,
        disc.topicGraph,
        []
      );
    expect(band("콘도 임대 합니다")).toBe(1);
    expect(band("아이폰 팝니다")).toBe(5);
    expect(buildSearchCandidateSqlFilter(disc, [])).not.toBeNull();
  });

  it("queries with ≥3-char tokens keep the 'all long tokens present' rule", async () => {
    const { classifyDiscoveryBand } = await import("@/lib/trade/marketplace/marketplace-discovery-rank");
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const sb = createFakePostgrestClient({ rows: [], tables: { categories: [] } });
    const disc = (await loadMarketplaceSearchDiscoveryContext(sb, null, "honda city", null))!;
    const band = (title: string) =>
      classifyDiscoveryBand(
        { id: "x", title, trade_category_id: CAT_A, meta: null } as never,
        disc.intent,
        disc.rootExpandedIdsByParent,
        disc.topicGraph,
        []
      );
    expect(band("city honda sedan")).toBe(2);
    expect(band("sofa chair")).toBe(5);
  });
});
