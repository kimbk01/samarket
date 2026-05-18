import { describe, expect, it } from "vitest";
import {
  shouldApplyExternalCommerceCartSnapshot,
  snapshotGeneration,
  withBumpedGeneration,
} from "@/lib/stores/store-commerce-cart-sync-guard";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

const snap = (gen: number): StoreCommerceCartSnapshotV2 => ({
  v: 2,
  generation: gen,
  touchedAtMs: gen,
  carts: {
    s1: {
      storeId: "s1",
      storeSlug: "a",
      storeName: "A",
      lines: [
        {
          lineId: "l1",
          productId: "p1",
          title: "x",
          thumbnailUrl: null,
          qty: 1,
          unitPricePhp: 100,
          optionSelections: {},
          optionsSummary: "",
          pickupAvailable: true,
          localDeliveryAvailable: true,
          shippingAvailable: false,
          minOrderQty: 1,
          maxOrderQty: 9,
        },
      ],
    },
  },
});

describe("store-commerce-cart-sync-guard", () => {
  it("rejects older external generation", () => {
    expect(shouldApplyExternalCommerceCartSnapshot(snap(5), snap(3))).toBe(false);
    expect(shouldApplyExternalCommerceCartSnapshot(snap(5), snap(6))).toBe(true);
  });

  it("bumps generation monotonically", () => {
    const next = withBumpedGeneration(snap(10));
    expect(snapshotGeneration(next)).toBeGreaterThan(10);
  });
});
