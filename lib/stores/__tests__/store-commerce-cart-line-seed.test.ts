import { describe, expect, it } from "vitest";
import {
  clampCartSeedQty,
  findCommerceCartLineByProductId,
  modifierWireFromCartLine,
} from "@/lib/stores/store-commerce-cart-line-seed";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";

function line(partial: Partial<StoreCommerceCartLine> & Pick<StoreCommerceCartLine, "lineId" | "productId">): StoreCommerceCartLine {
  return {
    title: "A",
    thumbnailUrl: null,
    qty: 1,
    unitPricePhp: 100,
    optionSelections: {},
    optionsSummary: "",
    pickupAvailable: true,
    localDeliveryAvailable: true,
    shippingAvailable: false,
    minOrderQty: 1,
    maxOrderQty: 99,
    ...partial,
  };
}

describe("store-commerce-cart-line-seed", () => {
  it("findCommerceCartLineByProductId returns latest line with qty>0", () => {
    const lines = [
      line({ lineId: "l1", productId: "p1", qty: 0 }),
      line({ lineId: "l2", productId: "p1", qty: 3 }),
    ];
    expect(findCommerceCartLineByProductId(lines, "p1")?.lineId).toBe("l2");
    expect(findCommerceCartLineByProductId(lines, "p2")).toBeNull();
  });

  it("findCommerceCartLineByProductId matches productId case-insensitively", () => {
    const uuid = "ad6f4c73-6108-48b4-93e8-9cb3dc66ed5f";
    const lines = [line({ lineId: "l1", productId: uuid, qty: 7 })];
    expect(findCommerceCartLineByProductId(lines, uuid.toUpperCase())?.qty).toBe(7);
  });

  it("modifierWireFromCartLine prefers modifierWire", () => {
    const w = modifierWireFromCartLine(
      line({
        lineId: "l1",
        productId: "p1",
        modifierWire: { pick: { size: ["L"] }, qty: { group: { opt: 2 } } },
        optionSelections: { size: ["S"] },
      })
    );
    expect(w.pick).toEqual({ size: ["L"] });
    expect(w.qty).toEqual({ group: { opt: 2 } });
  });

  it("clampCartSeedQty respects min and cap", () => {
    expect(clampCartSeedQty(line({ lineId: "l1", productId: "p1", qty: 3 }), 1, 99)).toBe(3);
    expect(clampCartSeedQty(line({ lineId: "l1", productId: "p1", qty: 50 }), 1, 10)).toBe(10);
    expect(clampCartSeedQty(line({ lineId: "l1", productId: "p1", qty: 0 }), 2, 10)).toBe(2);
  });
});
