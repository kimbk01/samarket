import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_PRODUCT_ACTIONS,
  buildAdminStoreProductPatch,
  isAdminStoreProductAction,
} from "@/lib/stores/admin-store-product-ops";

describe("admin-store-product-ops", () => {
  it("gates unknown actions", () => {
    expect(isAdminStoreProductAction("sold_out")).toBe(true);
    expect(isAdminStoreProductAction("approve_review")).toBe(true);
    expect(isAdminStoreProductAction("delete_forever")).toBe(false);
  });

  it("maps limited ops onto store_products fields only", () => {
    expect(buildAdminStoreProductPatch("sold_out", null)).toEqual({
      product_status: "sold_out",
      admin_review_memo: null,
    });
    expect(buildAdminStoreProductPatch("hide", "note")).toMatchObject({
      product_status: "hidden",
      admin_review_memo: "note",
    });
    expect(buildAdminStoreProductPatch("approve_review", null)).toEqual({
      admin_review_status: "approved",
      admin_review_memo: null,
    });
    expect(ADMIN_STORE_PRODUCT_ACTIONS).not.toContain("create");
    expect(ADMIN_STORE_PRODUCT_ACTIONS).not.toContain("edit_price");
  });
});
