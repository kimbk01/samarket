import { describe, expect, it, vi } from "vitest";
import { createStoreOrderAtomic } from "@/lib/stores/create-store-order-atomic";

describe("createStoreOrderAtomic", () => {
  it("maps RPC success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        order: { id: "o1", order_no: "SO1", payment_amount: 100 },
        sold_out_products: [{ productId: "p1", productTitle: "A" }],
        order_created_event_id: "e1",
        store_name: "S",
        owner_user_id: "u1",
      },
      error: null,
    });
    const sb = { rpc } as any;
    const res = await createStoreOrderAtomic(sb, {
      buyerUserId: "b1",
      storeId: "s1",
      clientOrderKey: "k1",
      order: {
        order_no: "SO1",
        total_amount: 100,
        discount_amount: 0,
        payment_amount: 100,
        delivery_fee_amount: 0,
        payment_status: "paid",
        fulfillment_type: "pickup",
      },
      lines: [
        {
          product_id: "p1",
          title: "A",
          unit: 100,
          qty: 1,
          subtotal: 100,
          options_snapshot: {
            v: 2,
            groups: [],
            summary: "",
            base_unit_after_discount: 100,
            unit_options_delta: 0,
          },
          base_unit_after_discount: 100,
          unit_options_delta: 0,
          expected_options_json: null,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.order.id).toBe("o1");
      expect(res.soldOutProducts).toEqual([{ productId: "p1", productTitle: "A" }]);
      expect(res.orderCreatedEventId).toBe("e1");
    }
    expect(rpc).toHaveBeenCalledWith(
      "create_store_order_atomic",
      expect.objectContaining({
        p_buyer_user_id: "b1",
        p_store_id: "s1",
        p_client_order_key: "k1",
      })
    );
  });

  it("maps idempotent success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        idempotent: true,
        order: { id: "o1", order_no: "SO1", payment_amount: 50 },
        sold_out_products: [],
      },
      error: null,
    });
    const res = await createStoreOrderAtomic({ rpc } as any, {
      buyerUserId: "b1",
      storeId: "s1",
      clientOrderKey: "k1",
      order: {
        order_no: "SO1",
        total_amount: 50,
        discount_amount: 0,
        payment_amount: 50,
        delivery_fee_amount: 0,
        payment_status: "paid",
        fulfillment_type: "pickup",
      },
      lines: [],
    });
    expect(res.ok && res.idempotent).toBe(true);
  });

  it("maps business error with http_status", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, error: "price_changed", http_status: 400 },
      error: null,
    });
    const res = await createStoreOrderAtomic({ rpc } as any, {
      buyerUserId: "b1",
      storeId: "s1",
      clientOrderKey: null,
      order: {
        order_no: "SO1",
        total_amount: 1,
        discount_amount: 0,
        payment_amount: 1,
        delivery_fee_amount: 0,
        payment_status: "paid",
        fulfillment_type: "pickup",
      },
      lines: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("price_changed");
      expect(res.httpStatus).toBe(400);
    }
  });

  it("maps missing RPC to 503", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Could not find the function create_store_order_atomic" },
    });
    const res = await createStoreOrderAtomic({ rpc } as any, {
      buyerUserId: "b1",
      storeId: "s1",
      clientOrderKey: null,
      order: {
        order_no: "SO1",
        total_amount: 1,
        discount_amount: 0,
        payment_amount: 1,
        delivery_fee_amount: 0,
        payment_status: "paid",
        fulfillment_type: "pickup",
      },
      lines: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("create_store_order_atomic_missing");
      expect(res.httpStatus).toBe(503);
    }
  });
});

describe("POST store-orders atomic path contract", () => {
  it("route no longer uses app-layer stock compensate loops", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("app/api/me/store-orders/route.ts", "utf8");
    expect(src).toContain("createStoreOrderAtomic");
    expect(src).not.toContain("restoreDecrementedStock");
    expect(src).not.toContain("stockRollback");
    expect(src).not.toContain("persistStoreOrderItemOptions");
  });

  it("migration covers TX boundary + TOCTOU + idempotency", async () => {
    const fs = await import("node:fs");
    const mig = fs.readFileSync(
      "supabase/migrations/20261022120000_create_store_order_atomic.sql",
      "utf8"
    );
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.create_store_order_atomic");
    expect(mig).toContain("pg_advisory_xact_lock");
    expect(mig).toContain("FOR UPDATE");
    expect(mig).toContain("stock_qty >= v_qty");
    expect(mig).toContain("WHEN unique_violation THEN");
    expect(mig).toContain("price_changed");
    expect(mig).toContain("store_closed");
    expect(mig).toContain("product_sold_out");
    expect(mig).toContain("order_created");
    expect(mig).toContain("store_order_item_options");
    // Business FAIL before mutate: pass-1 stock check without UPDATE
    expect(mig).toMatch(/Pass 1:[\s\S]*insufficient_stock[\s\S]*Pass 2/);
  });

  it("coupon redemption lives inside atomic RPC migration (Stores A)", async () => {
    const fs = await import("node:fs");
    const mig = fs.readFileSync(
      "supabase/migrations/20260825121000_create_store_order_atomic_user_coupon.sql",
      "utf8"
    );
    expect(mig).toContain("user_coupon_id");
    expect(mig).toContain("coupon_user_entitlements");
    expect(mig).toContain("store_coupon_redemptions");
  });
});
