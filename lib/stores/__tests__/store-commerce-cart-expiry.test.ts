import { describe, expect, it } from "vitest";
import { computeStoreCartAddOrMerge, emptyCommerceCartV2 } from "@/lib/stores/store-commerce-cart-add-merge";
import {
  enforceSingleActiveStoreCart,
  isCommerceCartSnapshotExpired,
  sanitizeCommerceCartSnapshot,
} from "@/lib/stores/store-commerce-cart-expiry";
import { STORE_CART_DEFAULT_TTL_MS } from "@/lib/stores/store-cart-policy";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

const baseLine = {
  storeId: "store-a",
  storeSlug: "a",
  storeName: "A",
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
};

describe("store-commerce-cart-expiry", () => {
  it("expires snapshot older than TTL", () => {
    const snap: StoreCommerceCartSnapshotV2 = {
      v: 2,
      touchedAtMs: Date.now() - STORE_CART_DEFAULT_TTL_MS - 1,
      carts: {
        "store-a": {
          storeId: "store-a",
          storeSlug: "a",
          storeName: "A",
          lines: [
            {
              lineId: "l1",
              productId: "p1",
              title: "x",
              thumbnailUrl: null,
              qty: 1,
              unitPricePhp: 1,
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
    };
    expect(isCommerceCartSnapshotExpired(snap)).toBe(true);
    expect(sanitizeCommerceCartSnapshot(snap).expired).toBe(true);
    expect(sanitizeCommerceCartSnapshot(snap).snapshot).toBeNull();
  });

  it("keeps only one nonempty store bucket", () => {
    const snap: StoreCommerceCartSnapshotV2 = {
      v: 2,
      touchedAtMs: Date.now(),
      carts: {
        a: {
          storeId: "store-a",
          storeSlug: "a",
          storeName: "A",
          touchedAtMs: 100,
          lines: [
            {
              lineId: "l1",
              productId: "p1",
              title: "x",
              thumbnailUrl: null,
              qty: 1,
              unitPricePhp: 1,
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
        b: {
          storeId: "store-b",
          storeSlug: "b",
          storeName: "B",
          touchedAtMs: 200,
          lines: [
            {
              lineId: "l2",
              productId: "p2",
              title: "y",
              thumbnailUrl: null,
              qty: 1,
              unitPricePhp: 2,
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
    };
    const { snapshot, droppedOtherStores } = enforceSingleActiveStoreCart(snap);
    expect(droppedOtherStores).toBe(true);
    expect(Object.keys(snapshot.carts)).toHaveLength(1);
    expect(Object.values(snapshot.carts)[0]?.storeId).toBe("store-b");
  });
});

describe("computeStoreCartAddOrMerge", () => {
  it("merges same product+options and blocks other store", () => {
    let snap = emptyCommerceCartV2();
    const first = computeStoreCartAddOrMerge(snap, baseLine);
    expect(first.result.ok).toBe(true);
    snap = first.nextSnapshot!;

    const merged = computeStoreCartAddOrMerge(snap, { ...baseLine, qty: 2 });
    expect(merged.result).toEqual({ ok: true, reason: "merged" });
    const bucket = Object.values(merged.nextSnapshot!.carts)[0]!;
    expect(bucket.lines).toHaveLength(1);
    expect(bucket.lines[0]?.qty).toBe(3);

    const blocked = computeStoreCartAddOrMerge(merged.nextSnapshot!, {
      ...baseLine,
      storeId: "store-b",
      storeSlug: "b",
      storeName: "B",
      productId: "p9",
    });
    expect(blocked.result).toMatchObject({
      ok: false,
      reason: "blocked_by_other_store",
    });
  });

  it("keeps same product+options separate when line memo differs", () => {
    let snap = emptyCommerceCartV2();
    const first = computeStoreCartAddOrMerge(snap, { ...baseLine, lineNote: "소스 많이" });
    expect(first.result).toEqual({ ok: true, reason: "added" });
    snap = first.nextSnapshot!;

    const second = computeStoreCartAddOrMerge(snap, { ...baseLine, lineNote: "젓가락 제외" });
    expect(second.result).toEqual({ ok: true, reason: "added" });

    const bucket = Object.values(second.nextSnapshot!.carts)[0]!;
    expect(bucket.lines).toHaveLength(2);
    expect(bucket.lines.map((l) => l.lineNote)).toEqual(["소스 많이", "젓가락 제외"]);
  });

  it("keeps same product separate when option selections differ", () => {
    let snap = emptyCommerceCartV2();
    const first = computeStoreCartAddOrMerge(snap, {
      ...baseLine,
      modifierWire: { pick: { sauce: ["fried"] }, qty: {} },
      optionSelections: { sauce: ["fried"] },
    });
    expect(first.result).toEqual({ ok: true, reason: "added" });
    snap = first.nextSnapshot!;

    const second = computeStoreCartAddOrMerge(snap, {
      ...baseLine,
      modifierWire: { pick: { sauce: ["spicy"] }, qty: {} },
      optionSelections: { sauce: ["spicy"] },
    });
    expect(second.result).toEqual({ ok: true, reason: "added" });

    const bucket = Object.values(second.nextSnapshot!.carts)[0]!;
    expect(bucket.lines).toHaveLength(2);
  });
});
