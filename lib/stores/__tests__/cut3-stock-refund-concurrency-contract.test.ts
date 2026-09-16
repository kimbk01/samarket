import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CUT 3 stock/refund concurrency contracts", () => {
  const stockMig = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20270101140000_restore_store_order_stock_atomic.sql"),
    "utf8"
  );
  const refundMig = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20270101150000_gift_refund_order_atomic_from_status_cas.sql"),
    "utf8"
  );
  const restoreTs = readFileSync(resolve(process.cwd(), "lib/stores/restore-order-stock.ts"), "utf8");
  const apply = readFileSync(
    resolve(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
    "utf8"
  );

  it("stock restore is atomic increment + per-order claim", () => {
    expect(stockMig).toMatch(/store_order_stock_restore_claims/);
    expect(stockMig).toMatch(/ON CONFLICT \(order_id\) DO NOTHING/);
    expect(stockMig).toMatch(/stock_qty = p\.stock_qty \+ v_line\.qty/);
    expect(restoreTs).toMatch(/restore_store_order_stock_atomic/);
    expect(apply).toMatch(/restoreStockForOrder\(sb, oid\)/);
    expect(apply).not.toMatch(/restoreStockForOrderLines/);
  });

  it("refund atomic requires refund_requested FROM status", () => {
    expect(refundMig).toMatch(/unexpected_from_status/);
    expect(refundMig).toMatch(/AND order_status = 'refund_requested'/);
    expect(refundMig).toMatch(/order_status = 'refunded'/);
  });
});
