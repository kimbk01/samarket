/**
 * 광고 ② PB-10 (2026-11-04) — 거래 카테고리 서버 시드도 `/api/trade/feed` 와 같은 지역(lguCityId·반경) 조건으로
 * 글을 읽고 상위노출을 끼운다. feedKey 에도 같은 지역 구간이 들어가 다른 지역 시드가 섞이지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ resolveOpen: vi.fn() }));

vi.mock("@/lib/posts/resolve-trade-feed-open-payload", () => ({
  resolveTradeFeedOpenPayload: (...a: unknown[]) => h.resolveOpen(...a),
}));
vi.mock("@/lib/market/trade-category-subtree", () => ({ fetchTradeCategoryDescendantNodes: async () => [] }));
vi.mock("@/lib/trade/category-form/load-composition-for-filter", () => ({
  resolveCompositionFilterQueryFromRequest: async () => ({ selection: {}, clauses: [] }),
}));
vi.mock("@/lib/posts/trade-soft-category-priority", () => ({ resolveTradeSoftCategoryPriorityForRoot: async () => null }));

import { loadMarketBootstrapPayload } from "@/lib/market/load-market-bootstrap-payload";
import { computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";

const CAT_ID = "11111111-1111-4111-8111-111111111111";
function fakeSb() {
  const chain = (rows: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: rows, error: null });
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return c;
  };
  return {
    from: () => chain({ id: CAT_ID, slug: "digital", icon_key: "digital", name: "디지털" }),
  };
}
const clients = () => ({ readSb: fakeSb(), serviceSb: fakeSb(), favoritesSb: fakeSb() }) as never;

beforeEach(() => {
  h.resolveOpen.mockReset().mockResolvedValue({ posts: [], hasMore: false, favoriteMap: {} });
});

describe("PB-10 서버 시드 지역 조건", () => {
  it("URL 의 location=city&lgu= 를 시드 조회에 넘기고 feedKey 도 같은 지역 구간", async () => {
    const sp = new URLSearchParams("location=city&lgu=pasig&radius=5");
    const r = await loadMarketBootstrapPayload(clients(), { q: CAT_ID, includePosts: true, filterSearchParams: sp });
    expect(r.ok).toBe(true);
    const opts = h.resolveOpen.mock.calls[0]![2] as { lguCityId?: string; radiusKm?: number | null };
    // `/api/trade/feed` 라우트와 같은 해석(같은 함수)
    const scope = parseTradeLocationScopeFromSearchParams(sp);
    expect(scope.mode).toBe("city");
    if (scope.mode !== "city") return;
    expect(opts.lguCityId).toBe(scope.lguId);
    expect(opts.radiusKm).toBe(scope.radiusKm);
    const feedKey = r.ok ? r.data.initialFeed?.feedKey : "";
    expect(feedKey).toBe(
      computeTradeFeedKeyForMarketParent(CAT_ID, "", "latest", undefined, { compositionFilters: {}, lguCityId: opts.lguCityId })
    );
    expect(feedKey).not.toContain("loc:unset");
  });

  it("location=all 이면 지역 조건 없음 · feedKey = loc:all", async () => {
    const r = await loadMarketBootstrapPayload(clients(), {
      q: CAT_ID,
      includePosts: true,
      filterSearchParams: new URLSearchParams("location=all"),
    });
    const opts = h.resolveOpen.mock.calls[0]![2] as { lguCityId?: string };
    expect(opts.lguCityId).toBeUndefined();
    expect(r.ok && r.data.initialFeed?.feedKey).toContain("loc:all");
  });

  it("지역 미지정이면 예전과 같다(loc:unset · 지역 조건 없음)", async () => {
    const r = await loadMarketBootstrapPayload(clients(), { q: CAT_ID, includePosts: true });
    const opts = h.resolveOpen.mock.calls[0]![2] as { lguCityId?: string };
    expect(opts.lguCityId).toBeUndefined();
    expect(r.ok && r.data.initialFeed?.feedKey).toContain("loc:unset");
  });
});
