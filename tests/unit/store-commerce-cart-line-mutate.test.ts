import { describe, expect, it } from "vitest";
import {
  mutateCartLineQuantity,
  mutateCartRemoveLine,
  mutateCartReplaceLineAt,
} from "@/lib/stores/store-commerce-cart-line-mutate";
import type { AddStoreCartLineInput } from "@/lib/stores/store-commerce-cart-types";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

const snap: StoreCommerceCartSnapshotV2 = {
  v: 2,
  carts: {
    b1: {
      storeId: "store-a",
      storeSlug: "a",
      storeName: "A",
      lines: [
        {
          lineId: "ln1",
          productId: "p1",
          title: "T",
          qty: 2,
          unitPricePhp: 100,
          minOrderQty: 1,
          maxOrderQty: 9,
        } as StoreCommerceCartSnapshotV2["carts"][string]["lines"][number],
      ],
    },
  },
};

describe("store-commerce-cart-line-mutate", () => {
  it("updates qty and reports store id", () => {
    const out = mutateCartLineQuantity(snap, "ln1", 3);
    expect(out.storeId).toBe("store-a");
    expect(out.deleted).toBe(false);
    expect(out.next?.carts.b1.lines[0].qty).toBe(3);
  });

  it("removes line when qty is zero", () => {
    const out = mutateCartLineQuantity(snap, "ln1", 0);
    expect(out.deleted).toBe(true);
    expect(out.next).toBeNull();
  });

  it("removeLine drops bucket", () => {
    const out = mutateCartRemoveLine(snap, "ln1");
    expect(out.storeId).toBe("store-a");
    expect(out.next).toBeNull();
  });

  it("replaceLineAt keeps lineId and updates fields", () => {
    const input: AddStoreCartLineInput = {
      storeId: "store-a",
      storeSlug: "a",
      storeName: "A",
      productId: "p1",
      title: "T2",
      thumbnailUrl: null,
      qty: 1,
      unitPricePhp: 120,
      optionSelections: {},
      optionsSummary: "옵션A",
      pickupAvailable: true,
      localDeliveryAvailable: true,
      shippingAvailable: false,
      minOrderQty: 1,
      maxOrderQty: 9,
    };
    const out = mutateCartReplaceLineAt(snap, "ln1", input);
    expect(out.ok).toBe(true);
    expect(out.next?.carts.b1.lines[0].lineId).toBe("ln1");
    expect(out.next?.carts.b1.lines[0].title).toBe("T2");
    expect(out.next?.carts.b1.lines[0].unitPricePhp).toBe(120);
  });
});
