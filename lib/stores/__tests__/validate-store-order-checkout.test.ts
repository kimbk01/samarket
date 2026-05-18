import { describe, expect, it } from "vitest";
import { assertSingleStoreOnOrderItems } from "@/lib/stores/validate-store-order-checkout";

describe("assertSingleStoreOnOrderItems", () => {
  it("rejects mixed store products", () => {
    const r = assertSingleStoreOnOrderItems("store-a", [
      { id: "p1", store_id: "store-a" },
      { id: "p2", store_id: "store-b" },
    ]);
    expect(r).toEqual({ ok: false, error: "mixed_store_cart" });
  });

  it("allows single store", () => {
    const r = assertSingleStoreOnOrderItems("store-a", [
      { id: "p1", store_id: "store-a" },
      { id: "p2", store_id: "store-a" },
    ]);
    expect(r).toEqual({ ok: true });
  });
});
