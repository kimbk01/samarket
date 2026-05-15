import { describe, expect, it } from "vitest";
import { findCommerceCartBucketBySlug } from "@/lib/stores/find-commerce-cart-bucket-by-slug";
import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

describe("find-commerce-cart-bucket-by-slug", () => {
  it("finds bucket by slug case-insensitively", () => {
    const snapshot: StoreCommerceCartSnapshotV2 = {
      v: 2,
      carts: {
        a: {
          storeId: "id-1",
          storeSlug: "My-Store",
          storeName: "My Store",
          lines: [],
        },
      },
    };
    expect(findCommerceCartBucketBySlug(snapshot, "my-store")?.storeId).toBe("id-1");
    expect(findCommerceCartBucketBySlug(snapshot, "other")).toBeNull();
  });
});
