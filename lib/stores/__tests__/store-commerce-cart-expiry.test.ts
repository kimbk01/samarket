import { describe, expect, it } from "vitest";
import {
  computeStoreCartAddOrMerge,
  consolidateCommerceCartBucketLines,
  emptyCommerceCartV2,
} from "@/lib/stores/store-commerce-cart-add-merge";
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
    expect(bucket.lines[0]?.qty).toBe(2);

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

  it("one line per productId — line memo on re-add replaces prior line", () => {
    let snap = emptyCommerceCartV2();
    const first = computeStoreCartAddOrMerge(snap, { ...baseLine, lineNote: "소스 많이" });
    snap = first.nextSnapshot!;

    const second = computeStoreCartAddOrMerge(snap, { ...baseLine, lineNote: "젓가락 제외" });
    expect(second.result).toEqual({ ok: true, reason: "merged" });

    const bucket = Object.values(second.nextSnapshot!.carts)[0]!;
    expect(bucket.lines).toHaveLength(1);
    expect(bucket.lines[0]?.lineNote).toBe("젓가락 제외");
  });

  it("one line per productId — different options on re-add replace prior line", () => {
    let snap = emptyCommerceCartV2();
    const first = computeStoreCartAddOrMerge(snap, {
      ...baseLine,
      modifierWire: { pick: { sauce: ["fried"] }, qty: {} },
      optionSelections: { sauce: ["fried"] },
    });
    snap = first.nextSnapshot!;

    const second = computeStoreCartAddOrMerge(snap, {
      ...baseLine,
      modifierWire: { pick: { sauce: ["spicy"] }, qty: {} },
      optionSelections: { sauce: ["spicy"] },
    });
    expect(second.result).toEqual({ ok: true, reason: "merged" });

    const bucket = Object.values(second.nextSnapshot!.carts)[0]!;
    expect(bucket.lines).toHaveLength(1);
    expect(bucket.lines[0]?.optionSelections).toEqual({ sauce: ["spicy"] });
  });

  it("re-add with qty 5 keeps 5 (set, not stack)", () => {
    let snap = emptyCommerceCartV2();
    snap = computeStoreCartAddOrMerge(snap, { ...baseLine, qty: 5 }).nextSnapshot!;
    const again = computeStoreCartAddOrMerge(snap, { ...baseLine, qty: 5 });
    const bucket = Object.values(again.nextSnapshot!.carts)[0]!;
    expect(bucket.lines).toHaveLength(1);
    expect(bucket.lines[0]?.qty).toBe(5);
  });

  it("merges duplicate lines with same options (pick-only vs full wire)", () => {
    const dupLines = [
      {
        lineId: "l1",
        productId: "p1",
        title: "Menu",
        thumbnailUrl: null,
        qty: 2,
        unitPricePhp: 250,
        optionSelections: { sauce: ["red"] },
        modifierWire: null,
        optionsSummary: "red",
        lineNote: null,
        pickupAvailable: true,
        localDeliveryAvailable: true,
        shippingAvailable: false,
        minOrderQty: 1,
        maxOrderQty: 99,
      },
      {
        lineId: "l2",
        productId: "p1",
        title: "Menu",
        thumbnailUrl: null,
        qty: 1,
        unitPricePhp: 300,
        optionSelections: { sauce: ["red"] },
        modifierWire: { pick: { sauce: ["red"] }, qty: {} },
        optionsSummary: "red",
        lineNote: null,
        pickupAvailable: true,
        localDeliveryAvailable: true,
        shippingAvailable: false,
        minOrderQty: 1,
        maxOrderQty: 99,
      },
    ];
    const out = consolidateCommerceCartBucketLines("store-a", dupLines);
    expect(out).toHaveLength(1);
    expect(out[0]?.qty).toBe(1);
    expect(out[0]?.unitPricePhp).toBe(300);
    expect(out[0]?.modifierWire).toEqual({ pick: { sauce: ["red"] }, qty: {} });
  });

  it("subtotal equals sum of line unitPricePhp × qty with options", () => {
    let snap = emptyCommerceCartV2();
    const withOpts = computeStoreCartAddOrMerge(snap, {
      ...baseLine,
      unitPricePhp: 300,
      qty: 3,
      modifierWire: { pick: { sauce: ["red"] }, qty: {} },
      optionSelections: { sauce: ["red"] },
    });
    snap = withOpts.nextSnapshot!;
    const bucket = Object.values(snap.carts)[0]!;
    const sum = bucket.lines.reduce(
      (n, l) => n + Math.floor(l.unitPricePhp) * Math.floor(l.qty),
      0
    );
    expect(sum).toBe(900);
    expect(bucket.lines).toHaveLength(1);
  });

  it("mergeQtyMode set keeps qty at selection (no double increment)", () => {
    let snap = emptyCommerceCartV2();
    const first = computeStoreCartAddOrMerge(snap, { ...baseLine, qty: 1, mergeQtyMode: "set" });
    snap = first.nextSnapshot!;

    const second = computeStoreCartAddOrMerge(snap, {
      ...baseLine,
      qty: 2,
      mergeQtyMode: "set",
    });
    const bucket = Object.values(second.nextSnapshot!.carts)[0]!;
    expect(bucket.lines[0]?.qty).toBe(2);
    expect(bucket.lines[0]?.unitPricePhp).toBe(baseLine.unitPricePhp);
    expect(bucket.lines[0]?.unitPricePhp! * bucket.lines[0]!.qty).toBe(
      baseLine.unitPricePhp * 2
    );
  });
});
