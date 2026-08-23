import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  loadStorePopularProductStatsBatch,
  normalizeStorePopularProductStatsByStore,
  type StorePopularProductStatRow,
} from "@/lib/stores/load-store-popular-product-stats-batch";
import {
  STORE_POPULAR_PRODUCT_METRIC_POPULATION,
  STORE_POPULAR_PRODUCT_METRIC_UNIT,
  STORE_POPULAR_PRODUCT_RANK_ORDER,
  STORE_POPULAR_PRODUCT_STATS_BATCH_RPC,
  STORE_POPULAR_PRODUCT_TIME_AUTHORITY,
} from "@/lib/stores/store-popular-product-metric-contract";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260823140000_store_popular_product_stats_batch_rpc.sql"
);

function row(
  partial: Partial<StorePopularProductStatRow> & Pick<StorePopularProductStatRow, "storeId" | "productId">
): StorePopularProductStatRow {
  return {
    storeId: partial.storeId,
    productId: partial.productId,
    totalQty: partial.totalQty ?? 0,
    lastOrderedAt: partial.lastOrderedAt ?? "2026-08-01T00:00:00.000Z",
    popularRank: partial.popularRank ?? 1,
  };
}

function mockSupabaseRpc(rows: Record<string, unknown>[], error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: rows, error });
  return { rpc } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function rpcMock(sb: import("@supabase/supabase-js").SupabaseClient) {
  return (sb as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
}

describe("store-popular-product-metric-contract", () => {
  it("locks discovery population and metric unit", () => {
    expect(STORE_POPULAR_PRODUCT_METRIC_POPULATION).toBe("completed_only");
    expect(STORE_POPULAR_PRODUCT_METRIC_UNIT).toBe("sum_quantity");
    expect(STORE_POPULAR_PRODUCT_TIME_AUTHORITY).toBe("store_orders.created_at");
    expect(STORE_POPULAR_PRODUCT_RANK_ORDER).toEqual([
      "total_qty_desc",
      "last_ordered_at_desc",
      "product_id_asc",
    ]);
    expect(STORE_POPULAR_PRODUCT_STATS_BATCH_RPC).toBe("get_store_popular_product_stats_batch");
  });
});

describe("batch RPC migration static contract", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("T1 — population is completed positive filter only", () => {
    const body = sql.split("as $$")[1]?.split("$$;")[0] ?? "";
    expect(body).toContain("so.order_status = 'completed'");
    expect(body).not.toMatch(/payment_status/i);
    expect(body).not.toContain("completed OR paid");
    expect(body).not.toContain("'paid'");
  });

  it("uses SUM(qty) not COUNT orders", () => {
    expect(sql).toMatch(/sum\s*\(\s*soi\.qty\s*\)/i);
    expect(sql).not.toMatch(/count\s*\(\s*\*\s*\)/i);
  });

  it("deterministic rank with product_id tie-breaker", () => {
    expect(sql).toContain("row_number() over");
    expect(sql).toContain("partition by a.store_id");
    expect(sql).toMatch(/order by a\.total_qty desc,\s*a\.last_ordered_at desc,\s*a\.product_id asc/i);
  });

  it("per-store limit clamp matches single-RPC convention", () => {
    expect(sql).toContain("greatest(1, least(p_limit_per_store, 50))");
  });

  it("does not overwrite legacy single-store RPC", () => {
    expect(sql).not.toContain("get_store_popular_product_stats(");
    expect(sql).toContain("get_store_popular_product_stats_batch");
  });

  it("matches P1-A empty-input guard", () => {
    expect(sql).toContain("cardinality(p_store_ids) > 0");
  });
});

describe("normalizeStorePopularProductStatsByStore", () => {
  it("T3 — store isolation via grouped map", () => {
    const rows = [
      row({ storeId: "s-a", productId: "p1", popularRank: 1 }),
      row({ storeId: "s-b", productId: "p2", popularRank: 1 }),
    ];
    const map = normalizeStorePopularProductStatsByStore(["s-a", "s-b"], rows);
    expect(map.get("s-a")?.map((r) => r.productId)).toEqual(["p1"]);
    expect(map.get("s-b")?.map((r) => r.productId)).toEqual(["p2"]);
  });

  it("T6 — no orders store gets empty array not fake product row", () => {
    const map = normalizeStorePopularProductStatsByStore(["empty-store"], []);
    expect(map.get("empty-store")).toEqual([]);
  });

  it("sorts by popularRank within store", () => {
    const rows = [
      row({ storeId: "s1", productId: "p2", popularRank: 2 }),
      row({ storeId: "s1", productId: "p1", popularRank: 1 }),
    ];
    const map = normalizeStorePopularProductStatsByStore(["s1"], rows);
    expect(map.get("s1")?.map((r) => r.productId)).toEqual(["p1", "p2"]);
  });
});

describe("loadStorePopularProductStatsBatch", () => {
  const since = "2026-07-01T00:00:00.000Z";

  it("T7 — invokes batch RPC exactly once", async () => {
    const sb = mockSupabaseRpc([]);
    const rpc = rpcMock(sb);
    await loadStorePopularProductStatsBatch(sb, ["store-a", "store-b"], {
      since,
      limitPerStore: 5,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(STORE_POPULAR_PRODUCT_STATS_BATCH_RPC, {
      p_store_ids: ["store-a", "store-b"],
      p_since: since,
      p_limit_per_store: 5,
    });
  });

  it("empty storeIds returns ok without RPC", async () => {
    const sb = mockSupabaseRpc([]);
    const rpc = rpcMock(sb);
    const result = await loadStorePopularProductStatsBatch(sb, [], { since, limitPerStore: 5 });
    expect(result.status).toBe("ok");
    expect(result.byStoreId.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("RPC error returns error status not ok-with-empty masquerade", async () => {
    const sb = mockSupabaseRpc([], { message: "rpc failed" });
    const result = await loadStorePopularProductStatsBatch(sb, ["s1"], { since, limitPerStore: 5 });
    expect(result.status).toBe("error");
    expect(result.byStoreId.size).toBe(0);
  });

  it("parses RPC rows into per-store arrays", async () => {
    const sb = mockSupabaseRpc([
      {
        store_id: "s1",
        product_id: "p1",
        total_qty: 5,
        last_ordered_at: "2026-08-10T00:00:00.000Z",
        popular_rank: 1,
      },
    ]);
    const result = await loadStorePopularProductStatsBatch(sb, ["s1"], { since, limitPerStore: 5 });
    expect(result.status).toBe("ok");
    const rows = result.byStoreId.get("s1");
    expect(rows?.length).toBe(1);
    expect(rows?.[0]).toMatchObject({
      storeId: "s1",
      productId: "p1",
      totalQty: 5,
      popularRank: 1,
    });
  });

  it("clamps limitPerStore to [1, 50]", async () => {
    const sb = mockSupabaseRpc([]);
    const rpc = rpcMock(sb);
    await loadStorePopularProductStatsBatch(sb, ["s1"], { since, limitPerStore: 999 });
    expect(rpc).toHaveBeenCalledWith(
      STORE_POPULAR_PRODUCT_STATS_BATCH_RPC,
      expect.objectContaining({ p_limit_per_store: 50 })
    );
  });

  it("missing since returns error without RPC", async () => {
    const sb = mockSupabaseRpc([]);
    const rpc = rpcMock(sb);
    const result = await loadStorePopularProductStatsBatch(sb, ["s1"], {
      since: "",
      limitPerStore: 5,
    });
    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("RPC output shape expectations (loader contract)", () => {
  it("T2 — total_qty reflects summed quantity from RPC", () => {
    const rows = [row({ storeId: "s1", productId: "p1", totalQty: 5, popularRank: 1 })];
    const map = normalizeStorePopularProductStatsByStore(["s1"], rows);
    expect(map.get("s1")?.[0]?.totalQty).toBe(5);
  });

  it("T4 — deterministic order preserved via popular_rank from SQL", () => {
    const rows = [
      row({
        storeId: "s1",
        productId: "p-b",
        totalQty: 10,
        lastOrderedAt: "2026-08-02T00:00:00.000Z",
        popularRank: 2,
      }),
      row({
        storeId: "s1",
        productId: "p-a",
        totalQty: 10,
        lastOrderedAt: "2026-08-03T00:00:00.000Z",
        popularRank: 1,
      }),
    ];
    const map = normalizeStorePopularProductStatsByStore(["s1"], rows);
    expect(map.get("s1")?.map((r) => r.productId)).toEqual(["p-a", "p-b"]);
  });

  it("T5 — per-store top N rows only in RPC payload", () => {
    const rows = [
      row({ storeId: "s1", productId: "p1", popularRank: 1 }),
      row({ storeId: "s1", productId: "p2", popularRank: 2 }),
    ];
    const map = normalizeStorePopularProductStatsByStore(["s1"], rows);
    expect(map.get("s1")?.length).toBe(2);
    expect(map.get("s1")?.every((r) => r.popularRank <= 2)).toBe(true);
  });
});

describe("legacy detail path unchanged", () => {
  it("single-store RPC migration still uses legacy population", () => {
    const legacyPath = path.join(
      process.cwd(),
      "supabase/migrations/20260515211000_store_popular_menu_stats_rpc.sql"
    );
    const legacy = readFileSync(legacyPath, "utf8");
    expect(legacy).toContain("get_store_popular_product_stats(");
    expect(legacy).toMatch(/payment_status/i);
  });
});
