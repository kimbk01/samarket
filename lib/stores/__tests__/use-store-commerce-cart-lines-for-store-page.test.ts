import { describe, expect, it } from "vitest";
import { resolveStorePageCartLines } from "@/lib/stores/use-store-commerce-cart-lines-for-store-page";
import type {
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

function line(partial: Partial<StoreCommerceCartLine> & Pick<StoreCommerceCartLine, "lineId" | "productId">): StoreCommerceCartLine {
  return {
    title: "t",
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

describe("resolveStorePageCartLines", () => {
  const productUuid = "ad6f4c73-6108-48b4-93e8-9cb3dc66ed5f";
  const storeUuid = "11111111-1111-1111-1111-111111111111";

  const snapshot: StoreCommerceCartSnapshotV2 = {
    v: 2,
    carts: {
      [storeUuid]: {
        storeId: storeUuid,
        storeSlug: "canonical-slug",
        storeName: "Test",
        lines: [line({ lineId: "l1", productId: productUuid, qty: 7 })],
      },
    },
  };

  it("resolves lines by storeId even when URL slug differs from bucket.storeSlug", () => {
    const { lines, activeStoreId } = resolveStorePageCartLines(
      snapshot,
      true,
      "aa11",
      storeUuid,
      (id) => snapshot.carts[id]?.lines ?? []
    );
    expect(activeStoreId).toBe(storeUuid);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.qty).toBe(7);
  });

  it("resolves storeId from slug when API store id not yet loaded", () => {
    const { lines, activeStoreId } = resolveStorePageCartLines(
      snapshot,
      true,
      "canonical-slug",
      null,
      (id) => snapshot.carts[id]?.lines ?? []
    );
    expect(activeStoreId).toBe(storeUuid);
    expect(lines[0]?.productId).toBe(productUuid);
  });

  it("returns empty when not hydrated", () => {
    const { lines } = resolveStorePageCartLines(snapshot, false, "aa11", storeUuid, () => []);
    expect(lines).toHaveLength(0);
  });
});
