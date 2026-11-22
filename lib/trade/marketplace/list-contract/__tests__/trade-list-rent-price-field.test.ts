import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trade/marketplace/sold-visible-window.server", () => ({
  resolveTradeSoldVisibleWindow: vi.fn(async () => ({ days: 30 })),
}));

const {
  REAL_ESTATE_DEAL_RENT_VALUE,
  REAL_ESTATE_DEAL_SALE_VALUE,
  resolveTradeFilterPriceMode,
  resolveTradeListPriceField,
} = await import("@/lib/trade/category-form/real-estate-deal-persist-scope");
const { buildCompositionFilterClauses } = await import("@/lib/trade/category-form/composition-filter-query");
const { resolveTradeComposition } = await import("@/lib/trade/category-form/resolve-composition");
const { fetchTradeListPage } = await import("@/lib/trade/marketplace/list-contract/trade-list-page.server");

const realEstate = resolveTradeComposition({ icon_key: "real-estate", slug: "property", fieldComposition: null });

describe("감사 R4 — 부동산 임대 가격 조건 = 월세", () => {
  it("서버가 만든 임대 조건이면 meta_monthly, 판매·조건 없음·다른 주제는 price", () => {
    const rent = buildCompositionFilterClauses({ deal_type: REAL_ESTATE_DEAL_RENT_VALUE }, realEstate);
    const sale = buildCompositionFilterClauses({ deal_type: REAL_ESTATE_DEAL_SALE_VALUE }, realEstate);
    expect(rent.length).toBeGreaterThan(0);
    expect(resolveTradeListPriceField(rent)).toBe("meta_monthly");
    expect(resolveTradeListPriceField(sale)).toBe("price");
    expect(resolveTradeListPriceField([])).toBe("price");
    expect(resolveTradeListPriceField(null)).toBe("price");
  });

  it("fetchTradeListPage 가 trade_list_page 에 price_field 를 보낸다", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const base = {
      universeTradeCategoryIds: null,
      primaryTradeCategoryIds: null,
      similarTradeCategoryIds: null,
      priceMin: 1000,
      priceMax: 5000,
      tradeState: "all" as never,
      q: "",
      sort: "latest" as const,
      location: {} as never,
      limit: 10,
      offset: 0,
      cursor: null,
    };
    await fetchTradeListPage({ rpc } as never, {
      ...base,
      compositionFilters: buildCompositionFilterClauses({ deal_type: REAL_ESTATE_DEAL_RENT_VALUE }, realEstate),
    });
    await fetchTradeListPage({ rpc } as never, { ...base, compositionFilters: null });
    const calls = rpc.mock.calls as unknown as [string, { p: Record<string, unknown> }][];
    expect(calls[0][1].p.price_field).toBe("meta_monthly");
    expect(calls[1][1].p.price_field).toBe("price");
  });

  it("필터 화면: 부동산은 유형을 골라야 가격 칸이 뜻을 가진다", () => {
    expect(resolveTradeFilterPriceMode("general", undefined)).toBe("price");
    expect(resolveTradeFilterPriceMode("real-estate", undefined)).toBe("hidden");
    expect(resolveTradeFilterPriceMode("real-estate", REAL_ESTATE_DEAL_SALE_VALUE)).toBe("sale");
    expect(resolveTradeFilterPriceMode("real-estate", REAL_ESTATE_DEAL_RENT_VALUE)).toBe("monthly");
  });

  it("마이그레이션: 알려진 값만 받고, 기본은 지금처럼 posts.price", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20271122140000_trade_list_page_rent_price_field.sql"),
      "utf8"
    );
    expect(sql).toContain("v_pfield := CASE WHEN p ->> 'price_field' = 'meta_monthly' THEN 'meta_monthly' ELSE 'price' END;");
    expect(sql).toContain("ELSE po.price END AS price,");
    expect(sql).toContain("WHEN b.price IS NULL THEN 1");
  });
});
