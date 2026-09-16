import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_PRODUCT_ACTIONS,
  buildAdminStoreProductPatch,
  isAdminStoreProductAction,
} from "@/lib/stores/admin-store-product-ops";

describe("admin-store-product-ops", () => {
  it("gates unknown actions", () => {
    expect(isAdminStoreProductAction("sold_out")).toBe(true);
    expect(isAdminStoreProductAction("correct_price")).toBe(true);
    expect(isAdminStoreProductAction("delete_forever")).toBe(false);
  });

  it("maps ops onto store_products fields only", () => {
    expect(buildAdminStoreProductPatch({ action: "sold_out", memo: null })).toEqual({
      ok: true,
      patch: {
        product_status: "sold_out",
        admin_review_memo: null,
      },
    });
    expect(buildAdminStoreProductPatch({ action: "hide", memo: "note" })).toMatchObject({
      ok: true,
      patch: {
        product_status: "hidden",
        admin_review_memo: "note",
      },
    });
    expect(
      buildAdminStoreProductPatch({ action: "correct_name", memo: null, name: "Fixed" })
    ).toEqual({
      ok: true,
      patch: { title: "Fixed", admin_review_memo: null },
    });
    expect(
      buildAdminStoreProductPatch({ action: "correct_price", memo: null, price: 150 })
    ).toEqual({
      ok: true,
      patch: { price: 150, admin_review_memo: null },
    });
    expect(buildAdminStoreProductPatch({ action: "archive", memo: null })).toMatchObject({
      ok: true,
      patch: { product_status: "hidden" },
    });
    expect(ADMIN_STORE_PRODUCT_ACTIONS).not.toContain("create");
    expect(ADMIN_STORE_PRODUCT_ACTIONS).not.toContain("delete_forever");
  });
});
