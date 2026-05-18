import { describe, expect, it } from "vitest";
import {
  storeCartConflictExistingFromBlockedAdd,
  storeCartConflictExistingFromBucket,
} from "@/lib/stores/store-cart-conflict-meta";

describe("store-cart-conflict-meta", () => {
  it("maps blocked add result to existing store meta", () => {
    const existing = storeCartConflictExistingFromBlockedAdd({
      ok: false,
      reason: "blocked_by_other_store",
      existingStoreId: "a",
      existingStoreSlug: "store-a",
      existingStoreName: "A매장",
      existingItemCount: 2,
      existingSubtotalPhp: 900,
      nextStoreId: "b",
    });
    expect(existing).toEqual({
      storeId: "a",
      storeSlug: "store-a",
      storeName: "A매장",
      itemCount: 2,
      subtotalPhp: 900,
    });
  });

  it("maps bucket summary to existing store meta", () => {
    const existing = storeCartConflictExistingFromBucket({
      storeId: "x",
      storeSlug: "x-slug",
      storeName: "X",
      itemCount: 1,
      subtotalPhp: 100,
    });
    expect(existing.storeSlug).toBe("x-slug");
  });
});
