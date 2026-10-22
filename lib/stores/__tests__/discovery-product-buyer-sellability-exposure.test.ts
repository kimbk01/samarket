/**
 * DSC-09 — 홈 선반·업종 목록 썸네일 노출도 상세·주문과 같은 구매자 판매 가능 규칙
 * (`storeProductBuyerVisibilityBlocked`: 검수 반려·재검수 대기, 숨김 메뉴 구역) 을 따른다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stores/browse-featured-items-cache", () => ({
  peekBrowseFeaturedItemsServerCache: () => undefined,
  setBrowseFeaturedItemsServerCache: () => {},
}));

import { loadBrowseFeaturedItemsBatch } from "@/lib/stores/load-browse-featured-items-batch";

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    store_id: "store-1",
    title: id,
    price: 100,
    thumbnail_url: null,
    is_featured: true,
    sort_order: 0,
    is_owner_recommended: false,
    admin_review_status: "none",
    store_menu_sections: { is_hidden: false },
    ...extra,
  };
}

const ROWS = [
  row("ok"),
  row("pending", { admin_review_status: "pending" }),
  row("rejected", { admin_review_status: "rejected" }),
  row("hidden-section", { store_menu_sections: [{ is_hidden: true }] }),
  row("no-section", { store_menu_sections: null }),
];

const selects: string[] = [];
function fakeSb() {
  return {
    from() {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["in", "eq", "order", "limit"]) chain[m] = self;
      chain.select = (cols: string) => {
        selects.push(cols);
        return chain;
      };
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: ROWS, error: null }).then(res);
      return chain;
    },
  };
}

describe("DSC-09 browse featured thumbnails", () => {
  it("excludes under-review / rejected / hidden-section products", async () => {
    const r = await loadBrowseFeaturedItemsBatch(fakeSb() as never, ["store-1"], { bypassCache: true });
    expect(r.byStoreId["store-1"]!.featuredItems.map((i) => i.id).sort()).toEqual(["no-section", "ok"]);
    expect(selects.every((s) => s.includes("admin_review_status") && s.includes("store_menu_sections"))).toBe(true);
  });
});

describe("DSC-09 home-feed shelves", () => {
  it("home-feed product rows select the sellability inputs and apply the shared predicate", () => {
    const src = readFileSync("app/api/stores/home-feed/route.ts", "utf8");
    expect(src).toContain("admin_review_status, store_menu_sections ( is_hidden )");
    expect(src).toMatch(
      /\(\(prods \?\? \[\]\) as ProductMini\[\]\)\.filter\(\(p\) => !storeProductBuyerVisibilityBlocked\(p\)\)/
    );
  });
});
