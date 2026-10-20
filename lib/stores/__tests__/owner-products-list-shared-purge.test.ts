/**
 * PRD-09 — 공개 캐시 세대 purge 가 오너 상품 목록 캐시(30s)도 비운다 (인스턴스 간 관리자 조치 반영).
 */
import { describe, expect, it } from "vitest";
import {
  loadOwnerProductsListSnapshot,
  peekOwnerProductsListCacheHit,
} from "@/lib/stores/owner-products-list-snapshot";
import { purgeAllStorePublicServerMemoryCaches } from "@/lib/stores/store-public-server-memory-purge";
import { createFakeStoreSupabase } from "@/lib/stores/__tests__/helpers/fake-store-supabase";

describe("owner products list cache × shared purge", () => {
  it("cached list is dropped by purgeAllStorePublicServerMemoryCaches", async () => {
    const { sb } = createFakeStoreSupabase(() => ({ data: [], error: null }));
    const res = await loadOwnerProductsListSnapshot(sb as never, "store-purge-1");
    expect(res.ok).toBe(true);
    expect(peekOwnerProductsListCacheHit("store-purge-1")).toBe(true);
    purgeAllStorePublicServerMemoryCaches();
    expect(peekOwnerProductsListCacheHit("store-purge-1")).toBe(false);
  });

  it("pre-migration DB: list falls back to legacy select without lock columns", async () => {
    const { sb, calls } = createFakeStoreSupabase((c) =>
      String(c.select).includes("sold_out_reason")
        ? { data: null, error: { message: "column store_products.sold_out_reason does not exist" } }
        : { data: [{ id: "p1", product_status: "active" }], error: null }
    );
    const res = await loadOwnerProductsListSnapshot(sb as never, "store-purge-2", { skipCache: true });
    expect(res.ok && res.snapshot.products).toHaveLength(1);
    expect(calls.filter((c) => c.table === "store_products")).toHaveLength(2);
  });
});
