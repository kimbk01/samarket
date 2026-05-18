import { describe, expect, it } from "vitest";
import {
  cartLineToPrefetchedListRow,
  resolveStoreCartSheetPrefetchedRow,
  storeCartInCartProductIdsKey,
} from "@/lib/stores/store-cart-sheet-prefetch";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";

function line(partial: Partial<StoreCommerceCartLine> & Pick<StoreCommerceCartLine, "lineId" | "productId">): StoreCommerceCartLine {
  return {
    title: "Burger",
    thumbnailUrl: null,
    qty: 2,
    unitPricePhp: 100,
    listUnitPricePhp: null,
    discountPercent: null,
    modifierWire: { pick: { size: ["L"] }, qty: {} },
    optionSelections: { size: ["L"] },
    optionsSummary: "Large",
    lineNote: null,
    pickupAvailable: true,
    localDeliveryAvailable: true,
    shippingAvailable: false,
    minOrderQty: 1,
    maxOrderQty: 10,
    ...partial,
  };
}

describe("store-cart-sheet-prefetch", () => {
  it("storeCartInCartProductIdsKey is stable for qty-only changes", () => {
    const a = line({ lineId: "a", productId: "p1" });
    const b = { ...a, qty: 5 };
    expect(storeCartInCartProductIdsKey([a])).toBe(storeCartInCartProductIdsKey([b]));
  });

  it("prefers menus row over cart line fallback", () => {
    const menus = { p1: { id: "p1", title: "From API", options_json: [] } };
    const edit = line({ lineId: "l1", productId: "p1" });
    const row = resolveStoreCartSheetPrefetchedRow("p1", edit, menus);
    expect(row?.title).toBe("From API");
  });

  it("cartLineToPrefetchedListRow marks has_options from selections", () => {
    const row = cartLineToPrefetchedListRow(line({ lineId: "l1", productId: "p1" }));
    expect(row.has_options).toBe(true);
    expect(row.id).toBe("p1");
  });
});
