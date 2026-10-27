/**
 * 거래 목록 계약 (Owner 2026-10-27 A·B·C·D) — `docs/dibay-marketplace-list-ssot-target.md`
 * 실제 supabase-js 빌더 + 메모리 PostgREST 평가기(SQL NULL 3값 논리)로:
 * - 모든 조합에서 전체가 나온다(누락 0 · 중복 0, 여러 페이지)
 * - 순서 = 물품 → 옵션 → 가격 → 상태 → 지역(내 동네 → 내 시 → 주변 → 그 외) → 최신
 * - 각 글의 안내 줄 키(`list_section`)
 */
import { describe, expect, it } from "vitest";
import {
  resolveHomePostsPayload,
  resolveHomePostsStatusOrByTradeState,
  HOME_POSTS_PAGE_SIZE,
} from "@/lib/posts/home-posts-query-server";
import {
  classifyListingBrowseTier,
  resolveBrowseLocationTiers,
  resolveBrowseLocationTiersForRadius,
} from "@/lib/trade/location/national/browse-location-tiers";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import {
  applyCompositionFilterClausesToPostgrest,
  buildCompositionFilterComplementOrBody,
  type CompositionFilterClause,
} from "@/lib/trade/category-form/composition-filter-query";
import {
  buildPriceComplementOrBody,
  rowMatchesCompositionClauses,
} from "@/lib/trade/marketplace/list-contract/list-segments";
import { createFakePostgrestClient, type FakeRow } from "@/lib/posts/__tests__/helpers/fake-postgrest";

const QC = "1381300000";
const MANILA = "1380600000";
const MAKATI = "1380300000";
const CEBU = "0730600000";
const ROOT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOPIC_A1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TOPIC_A2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const ROOT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HOOD = { regionId: "quezon", cityId: "q5" };

type Loc = { trade_lgu_id: string | null; region: string | null; city: string | null };
const LOCS: Loc[] = [
  { trade_lgu_id: QC, region: "quezon", city: "q5" }, // 내 동네
  { trade_lgu_id: QC, region: null, city: null }, // 내 시
  { trade_lgu_id: null, region: "quezon", city: "q5" }, // 예전 글 · 내 동네
  { trade_lgu_id: MANILA, region: null, city: null }, // 주변
  { trade_lgu_id: MAKATI, region: "quezon", city: "q5" }, // 주변(lgu 우선) — 동네 아님
  { trade_lgu_id: CEBU, region: null, city: null }, // 그 외
  { trade_lgu_id: null, region: null, city: null }, // 그 외(위치 없음)
];
const CATS = [TOPIC_A1, TOPIC_A2, ROOT_A, ROOT_B];

function makeRows(n: number): FakeRow[] {
  const base = Date.parse("2026-10-01T00:00:00.000Z");
  const rows: FakeRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: `r${String(i).padStart(4, "0")}`,
      type: "trade",
      title: i % 5 === 0 ? `phone ${i}` : `chair ${i}`,
      price: i % 11 === 0 ? null : 50 + ((i * 13) % 250),
      status: i % 13 === 0 ? "sold" : i % 29 === 0 ? "hidden" : "active",
      trade_category_id: CATS[i % CATS.length],
      meta: { body_type: i % 3 === 0 ? "suv" : i % 3 === 1 ? "sedan" : null },
      view_count: (i * 31) % 97,
      created_at: new Date(base + i * 60_000).toISOString(),
      user_id: "u1",
      ...LOCS[(i * 3) % LOCS.length],
    });
  }
  return rows;
}

const STATUS_OR = resolveHomePostsStatusOrByTradeState("latest");
const SUV: CompositionFilterClause[] = [{ fieldId: "body", op: "eq", columns: ["meta->>body_type"], values: ["suv"] }];

async function allPages(fetch: (from: number) => Promise<{ posts: Array<{ id: string; list_section?: string }>; hasMore: boolean } | null>) {
  const out: Array<{ id: string; list_section?: string }> = [];
  for (let p = 0; p < 60; p++) {
    const res = await fetch(p * HOME_POSTS_PAGE_SIZE);
    if (!res) throw new Error("page failed");
    out.push(...res.posts);
    if (!res.hasMore) return out;
  }
  throw new Error("no end");
}

function locRank(r: FakeRow, radiusKm: number | null, hood: typeof HOOD | null): number {
  const c = resolveTradeFeedLocationConstraint(QC, radiusKm);
  const tiers = radiusKm == null ? resolveBrowseLocationTiers(c)! : resolveBrowseLocationTiersForRadius(c)!;
  const t = classifyListingBrowseTier(r as Loc, tiers);
  if (t === "local") {
    if (hood && radiusKm == null && r.region === hood.regionId && r.city === hood.cityId) return 0;
    return 1;
  }
  return t === "nearby" ? 2 : 3;
}

describe("거래 목록 계약 — 전체 표시 + 순서", () => {
  const rows = makeRows(260);
  const visible = rows.filter((r) => r.status !== "hidden");

  it("물품(하위) + 옵션 + 가격 + 상태 + 내 동네: 전체 · 누락 0 · 중복 0 · 계약 순서", async () => {
    const sb = createFakePostgrestClient({ rows });
    const got = await allPages((from) =>
      resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, QC, null, {
        categoryPriorityRootTradeCategoryIds: [ROOT_A, TOPIC_A1, TOPIC_A2],
        categoryPriorityTopicTradeCategoryIds: [TOPIC_A1],
        compositionFilters: SUV,
        priceMin: 100,
        priceMax: 200,
        listTradeState: "all",
        listHood: HOOD,
      })
    );
    const ids = got.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(visible.length);

    const cat = (r: FakeRow) => (r.trade_category_id === TOPIC_A1 ? 0 : [ROOT_A, TOPIC_A2].includes(String(r.trade_category_id)) ? 1 : 2);
    const opt = (r: FakeRow) => ((r.meta as { body_type?: string }).body_type === "suv" ? 0 : 1);
    const price = (r: FakeRow) => (r.price != null && Number(r.price) >= 100 && Number(r.price) <= 200 ? 0 : 1);
    const sold = (r: FakeRow) => (r.status === "sold" ? 1 : 0);
    const expected = [...visible]
      .sort(
        (a, b) =>
          cat(a) - cat(b) ||
          opt(a) - opt(b) ||
          price(a) - price(b) ||
          sold(a) - sold(b) ||
          locRank(a, null, HOOD) - locRank(b, null, HOOD) ||
          String(b.created_at).localeCompare(String(a.created_at))
      )
      .map((r) => String(r.id));
    expect(ids).toEqual(expected);

    // 안내 줄 키: 첫 구간 "" · 이후 조각
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const first = got[0]!;
    expect(first.list_section).toBe("");
    const other = got.find((p) => cat(byId.get(p.id)!) === 2)!;
    expect(other.list_section?.split("|")).toContain("cat:other");
    const nearbySold = got.find((p) => {
      const r = byId.get(p.id)!;
      return cat(r) === 0 && opt(r) === 0 && price(r) === 0 && sold(r) === 1 && locRank(r, null, HOOD) === 2;
    });
    if (nearbySold) expect(nearbySold.list_section).toBe("state:sold|loc:nearby");
  });

  it("거리 5km: 반경 안 → 주변 → 그 외, 내 동네 구간 없음, 전체", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = (
      await allPages((from) =>
        resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, QC, 5, { listHood: HOOD })
      )
    ).map((p) => p.id);
    const sold = (r: FakeRow) => (r.status === "sold" ? 1 : 0);
    const expected = [...visible]
      .sort(
        (a, b) =>
          sold(a) - sold(b) ||
          locRank(a, 5, null) - locRank(b, 5, null) ||
          String(b.created_at).localeCompare(String(a.created_at))
      )
      .map((r) => String(r.id));
    expect(ids).toEqual(expected);
  });

  it("주소 미지정(전국): 판매중 최신 → 판매완료 최신, 전체", async () => {
    const sb = createFakePostgrestClient({ rows });
    const ids = (
      await allPages((from) => resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, null, null, {}))
    ).map((p) => p.id);
    const sold = (r: FakeRow) => (r.status === "sold" ? 1 : 0);
    expect(ids).toEqual(
      [...visible]
        .sort((a, b) => sold(a) - sold(b) || String(b.created_at).localeCompare(String(a.created_at)))
        .map((r) => String(r.id))
    );
  });

  it("거래 상태 「판매완료」: 판매완료 → 판매중(숨기지 않음)", async () => {
    const sb = createFakePostgrestClient({ rows });
    const got = await allPages((from) =>
      resolveHomePostsPayload(sb, null, from, "latest", "trade", null, STATUS_OR, null, null, { listTradeState: "sold" })
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const firstActive = got.findIndex((p) => byId.get(p.id)!.status !== "sold");
    expect(got.slice(0, firstActive).every((p) => byId.get(p.id)!.status === "sold")).toBe(true);
    expect(got.slice(firstActive).every((p) => byId.get(p.id)!.status !== "sold")).toBe(true);
    expect(got[firstActive]!.list_section).toBe("state:active");
    expect(got.length).toBe(visible.length);
  });
});

describe("품목 옵션·가격 「안 맞음」 = 정확한 여집합 (SQL NULL 포함)", () => {
  const rows: FakeRow[] = [
    { id: "1", meta: { body_type: "suv", color: "Red apple" }, price: 10 },
    { id: "2", meta: { body_type: "sedan", color: "blue" }, price: null },
    { id: "3", meta: {}, price: 500 },
    { id: "4", meta: { body_type: null, color: "red" }, price: 150 },
    { id: "5", meta: { body_type: "SUV", color: "green" }, price: 200 },
  ];
  const clauseSets: CompositionFilterClause[][] = [
    [{ fieldId: "b", op: "eq", columns: ["meta->>body_type"], values: ["suv"] }],
    [{ fieldId: "c", op: "ilike", columns: ["meta->>color"], values: ["red", "blue"] }],
    [{ fieldId: "x", op: "exclude_eq", columns: ["meta->>body_type"], values: ["sedan"] }],
    [{ fieldId: "o", op: "or_eq", columns: ["meta->>body_type", "meta->>color"], values: ["suv", "blue"] }],
    [
      { fieldId: "b", op: "eq", columns: ["meta->>body_type"], values: ["suv"] },
      { fieldId: "c", op: "ilike", columns: ["meta->>color"], values: ["red"] },
    ],
  ];
  for (const [i, clauses] of clauseSets.entries()) {
    it(`조건 묶음 ${i + 1}: 맞음 ∪ 안 맞음 = 전체, 겹침 0, 메모리 판정 일치`, async () => {
      const sb = createFakePostgrestClient({ rows });
      const match = await applyCompositionFilterClausesToPostgrest(sb.from("posts").select("id") as never, clauses);
      const matchIds = ((await (match as unknown as Promise<{ data: Array<{ id: string }> }>)).data ?? []).map((r) => r.id);
      const complement = buildCompositionFilterComplementOrBody(clauses)!;
      const { data: restData } = await sb.from("posts").select("id").or(complement);
      const restIds = (restData ?? []).map((r: { id: string }) => r.id);
      expect(new Set([...matchIds, ...restIds]).size).toBe(rows.length);
      expect(matchIds.filter((id) => restIds.includes(id))).toEqual([]);
      for (const r of rows) {
        expect(rowMatchesCompositionClauses(r as never, clauses), `row ${r.id}`).toBe(matchIds.includes(String(r.id)));
      }
    });
  }

  it("가격 범위 밖 = 범위 안의 정확한 여집합(가격 없음 포함)", async () => {
    const sb = createFakePostgrestClient({ rows });
    const { data: inData } = await sb.from("posts").select("id").gte("price", 100).lte("price", 200);
    const { data: outData } = await sb.from("posts").select("id").or(buildPriceComplementOrBody(100, 200)!);
    const a = (inData ?? []).map((r: { id: string }) => r.id);
    const b = (outData ?? []).map((r: { id: string }) => r.id);
    expect(a.sort()).toEqual(["4", "5"]);
    expect(b.sort()).toEqual(["1", "2", "3"]);
  });
});

describe("찾기 — 일치 단계 → 목록과 같은 구간 → 나머지 전체 (여러 페이지)", () => {
  it("q + 물품(하위) + 가격: 전체 · 누락 0 · 중복 0 · 계약 순서 · 나머지 키 q:rest", async () => {
    const { resolveSearchExpansionRound } = await import("@/lib/posts/home-posts-query-server");
    const { takeSearchRankedWindowPage, resetSearchRankedWindowCacheForTests } = await import(
      "@/lib/trade/marketplace/search-ranked-window-cache"
    );
    const { loadMarketplaceSearchDiscoveryContext } = await import(
      "@/lib/trade/marketplace/load-marketplace-search-discovery-context"
    );
    const { classifyDiscoveryBand } = await import("@/lib/trade/marketplace/marketplace-discovery-rank");
    resetSearchRankedWindowCacheForTests();
    const rows = makeRows(240);
    const categories = [
      { id: ROOT_A, name: "general", slug: "general", type: "trade", is_active: true, parent_id: null, sort_order: 0, show_in_home_chips: true, icon_key: "general" },
      { id: TOPIC_A1, name: "phones", slug: "phones", type: "trade", is_active: true, parent_id: ROOT_A, sort_order: 0, show_in_home_chips: false, icon_key: "general" },
      { id: TOPIC_A2, name: "chairs", slug: "chairs", type: "trade", is_active: true, parent_id: ROOT_A, sort_order: 1, show_in_home_chips: false, icon_key: "general" },
      { id: ROOT_B, name: "cars", slug: "cars", type: "trade", is_active: true, parent_id: null, sort_order: 1, show_in_home_chips: true, icon_key: "used-car" },
    ];
    const sb = createFakePostgrestClient({ rows, tables: { categories } });
    const discovery = await loadMarketplaceSearchDiscoveryContext(sb, null, "phone", null);
    const extras = {
      q: "phone",
      searchDiscoveryContext: discovery,
      categoryPriorityRootTradeCategoryIds: [ROOT_A, TOPIC_A1, TOPIC_A2],
      categoryPriorityTopicTradeCategoryIds: [TOPIC_A1],
      priceMin: 100,
      priceMax: 200,
      listTradeState: "all" as const,
    };
    const got: Array<{ id: string; list_section?: string }> = [];
    for (let page = 1; page <= 20; page++) {
      const res = await takeSearchRankedWindowPage({
        key: "list-contract-search",
        page,
        pageSize: 50,
        loadNext: (cursor) =>
          resolveSearchExpansionRound(sb, null, "latest", "trade", null, STATUS_OR, QC, null, extras, cursor),
      });
      expect(res).not.toBeNull();
      got.push(...res!.posts.map((p) => ({ id: String(p.id), list_section: p.list_section })));
      if (!res!.hasMore) break;
    }
    const ids = got.map((p) => p.id);
    const visible = rows.filter((r) => r.status !== "hidden");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(visible.length);

    const band = (r: FakeRow) =>
      classifyDiscoveryBand(r as never, discovery!.intent, discovery!.rootExpandedIdsByParent, discovery!.topicGraph, []);
    const cat = (r: FakeRow) => (r.trade_category_id === TOPIC_A1 ? 0 : [ROOT_A, TOPIC_A2].includes(String(r.trade_category_id)) ? 1 : 2);
    const price = (r: FakeRow) => (r.price != null && Number(r.price) >= 100 && Number(r.price) <= 200 ? 0 : 1);
    const sold = (r: FakeRow) => (r.status === "sold" ? 1 : 0);
    const expected = [...visible]
      .sort(
        (a, b) =>
          band(a) - band(b) ||
          cat(a) - cat(b) ||
          price(a) - price(b) ||
          sold(a) - sold(b) ||
          locRank(a, null, null) - locRank(b, null, null) ||
          String(b.created_at).localeCompare(String(a.created_at))
      )
      .map((r) => String(r.id));
    expect(ids).toEqual(expected);
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const firstRest = got.findIndex((p) => band(byId.get(p.id)!) >= 5);
    expect(firstRest).toBeGreaterThan(0);
    expect(got[firstRest]!.list_section?.startsWith("q:rest")).toBe(true);
    expect(got.slice(firstRest).every((p) => p.list_section?.startsWith("q:rest"))).toBe(true);
  });
});
