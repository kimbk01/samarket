import { describe, expect, it } from "vitest";
import {
  assemblePlatformPopularProductsForStore,
  buildActiveProductCatalogMap,
  resolvePopularMenuStatsSinceIso,
} from "@/lib/stores/assemble-store-home-platform-popular-products";
import type { StorePopularProductStatRow } from "@/lib/stores/load-store-popular-product-stats-batch";

function catalog(
  entries: Array<{ id: string; store_id: string; title: string; price: number }>
) {
  return buildActiveProductCatalogMap(
    entries.map((e) => ({
      id: e.id,
      store_id: e.store_id,
      title: e.title,
      price: e.price,
      thumbnail_url: null,
    })),
    () => null
  );
}

describe("assemble-store-home-platform-popular-products", () => {
  it("rank1 inactive catalog miss → rank2 active eligible", () => {
    const byStore = catalog([
      { id: "p2", store_id: "s1", title: "Active", price: 200 },
    ]);
    const map = byStore.get("s1")!;
    const stats: StorePopularProductStatRow[] = [
      { storeId: "s1", productId: "p1", totalQty: 50, lastOrderedAt: "2026-01-01", popularRank: 1 },
      { storeId: "s1", productId: "p2", totalQty: 10, lastOrderedAt: "2026-01-02", popularRank: 2 },
    ];
    const out = assemblePlatformPopularProductsForStore(stats, map, 1, 30);
    expect(out).toHaveLength(1);
    expect(out[0]?.productId).toBe("p2");
    expect(out[0]?.popularRank).toBe(2);
  });

  it("total_qty below minQty → skipped", () => {
    const byStore = catalog([{ id: "p1", store_id: "s1", title: "A", price: 100 }]);
    const map = byStore.get("s1")!;
    const stats: StorePopularProductStatRow[] = [
      { storeId: "s1", productId: "p1", totalQty: 2, lastOrderedAt: "2026-01-01", popularRank: 1 },
    ];
    const out = assemblePlatformPopularProductsForStore(stats, map, 5, 30);
    expect(out).toEqual([]);
  });

  it("resolvePopularMenuStatsSinceIso uses window days", () => {
    const iso = resolvePopularMenuStatsSinceIso(30);
    const ms = Date.parse(iso);
    const diffDays = (Date.now() - ms) / 86_400_000;
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });
});
