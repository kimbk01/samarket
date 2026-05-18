import { describe, expect, it, beforeEach } from "vitest";
import {
  publishCommerceCartSnapshot,
  getCommerceCartSnapshotBus,
} from "@/lib/stores/store-commerce-cart-snapshot-bus";
import {
  readStoreCommerceCartBucketStatsForSnapshot,
  readStoreCommerceCartLinesForSnapshot,
  resetStoreCommerceCartSelectorCachesForTests,
} from "@/lib/stores/use-store-commerce-cart-selector";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

describe("use-store-commerce-cart-selector snapshot stability", () => {
  beforeEach(() => {
    resetStoreCommerceCartSelectorCachesForTests();
    publishCommerceCartSnapshot(false, null);
  });

  it("returns the same empty lines array reference when cart is empty", () => {
    publishCommerceCartSnapshot(true, null);
    const a = readStoreCommerceCartLinesForSnapshot("store-1");
    const b = readStoreCommerceCartLinesForSnapshot("store-1");
    expect(a).toBe(b);
    expect(a).toHaveLength(0);
  });

  it("returns the same lines array reference for unchanged bus generation", () => {
    const snap: StoreCommerceCartSnapshotV2 = {
      v: 2,
      carts: {
        s1: {
          storeId: "store-1",
          storeSlug: "slug-1",
          storeName: "A",
          lines: [
            {
              lineId: "l1",
              productId: "p1",
              title: "Menu",
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
            },
          ],
        },
      },
      generation: 1,
    };
    publishCommerceCartSnapshot(true, snap);
    const gen = getCommerceCartSnapshotBus().generation;
    const first = readStoreCommerceCartLinesForSnapshot("store-1");
    expect(first).toHaveLength(1);
    const second = readStoreCommerceCartLinesForSnapshot("store-1");
    expect(second).toBe(first);
    expect(getCommerceCartSnapshotBus().generation).toBe(gen);
  });

  it("returns stable empty hydrated stats", () => {
    publishCommerceCartSnapshot(true, null);
    const a = readStoreCommerceCartBucketStatsForSnapshot("missing");
    const b = readStoreCommerceCartBucketStatsForSnapshot("missing");
    expect(a).toBe(b);
    expect(a.hydrated).toBe(true);
    expect(a.itemCount).toBe(0);
  });
});
