import { describe, expect, it } from "vitest";
import { mergeStoreOrderLineItems } from "@/lib/stores/store-order-line-merge";
import type { StoreOrderLineInput } from "@/lib/stores/validate-store-order-checkout";

const baseLine: StoreOrderLineInput = {
  product_id: "p1",
  qty: 1,
  wire: { pick: {}, qty: {} },
  line_note: null,
  client_unit_php: 100,
};

describe("mergeStoreOrderLineItems", () => {
  it("merges duplicate product/options/memo lines before checkout validation", () => {
    const merged = mergeStoreOrderLineItems("store-a", [
      baseLine,
      { ...baseLine, qty: 2 },
      { ...baseLine, qty: 3 },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.qty).toBe(6);
  });

  it("keeps different line memos separate", () => {
    const merged = mergeStoreOrderLineItems("store-a", [
      { ...baseLine, line_note: "소스 많이" },
      { ...baseLine, line_note: "젓가락 제외" },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((l) => l.line_note)).toEqual(["소스 많이", "젓가락 제외"]);
  });

  it("keeps different options separate", () => {
    const merged = mergeStoreOrderLineItems("store-a", [
      { ...baseLine, wire: { pick: { size: ["L"] }, qty: {} } },
      { ...baseLine, wire: { pick: { size: ["M"] }, qty: {} } },
    ]);

    expect(merged).toHaveLength(2);
  });
});
