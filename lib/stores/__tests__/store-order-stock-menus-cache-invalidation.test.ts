/**
 * CRT-07 — 주문 재고 0 자동 품절·취소 재고 복원 뒤 소비자 메뉴 캐시를
 * 오너 쓰기와 같은 경로(`invalidateStoreMenusSnapshotCacheByStoreId` + 공용 세대 bump)로 무효화.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ menus: [] as string[], bump: [] as string[] }));
vi.mock("@/lib/stores/store-menus-snapshot-invalidate-by-store-id", () => ({
  invalidateStoreMenusSnapshotCacheByStoreId: (sid: string) => calls.menus.push(sid),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (reason: string) => calls.bump.push(reason),
}));

import { restoreStockForOrder } from "@/lib/stores/restore-order-stock";

function restoreSb(rpcRow: Record<string, unknown>) {
  return {
    rpc: async () => ({ data: rpcRow, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "store_orders" ? { store_id: "store-9" } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.menus.length = 0;
  calls.bump.length = 0;
});

describe("CRT-07 stock restore invalidates consumer menus cache", () => {
  it("restored products > 0 → invalidates that order's store", async () => {
    const r = await restoreStockForOrder(
      restoreSb({ ok: true, idempotent: false, restored_products: 2 }) as never,
      "order-1"
    );
    await flush();
    expect(r).toEqual({ ok: true, idempotent: false });
    expect(calls.menus).toEqual(["store-9"]);
    expect(calls.bump).toEqual(["store_menus_stock.restore"]);
  });

  it("idempotent replay or no tracked products → no invalidation", async () => {
    await restoreStockForOrder(restoreSb({ ok: true, idempotent: true, restored_products: 0 }) as never, "o");
    await restoreStockForOrder(restoreSb({ ok: true, idempotent: false, restored_products: 0 }) as never, "o");
    await flush();
    expect(calls.menus).toEqual([]);
    expect(calls.bump).toEqual([]);
  });
});

describe("CRT-07 order create auto sold-out invalidates consumer menus cache", () => {
  it("POST /api/me/store-orders invalidates when the RPC reports sold-out products", () => {
    const src = readFileSync("app/api/me/store-orders/route.ts", "utf8");
    expect(src).toMatch(
      /if \(atomic\.soldOutProducts\.length > 0\) \{\s*invalidateStorePublicMenusAfterOrderStockChange\(storeId, "store_menus_stock\.auto_sold_out"\);/
    );
  });
});
