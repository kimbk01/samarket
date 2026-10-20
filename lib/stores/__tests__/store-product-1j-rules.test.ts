import { describe, expect, it } from "vitest";
import {
  isMissingStoreProductLockColumnError,
  isStoreProductReviewUnsellable,
  ownerProductStatusChangeBlock,
  ownerProductToggleLockReason,
  ownerSoldOutReasonForStatus,
  stripStoreProductLockColumns,
} from "@/lib/stores/store-product-admin-lock";
import {
  isDirectDiscountPriceValid,
  reconcileDiscountForNewPrice,
} from "@/lib/stores/store-product-discount-reconcile";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";
import { storeOrderLineProductError } from "@/lib/stores/validate-store-order-checkout";
import { diffOwnerProductPatch } from "@/lib/stores/owner-product-patch-diff";

describe("ND-1 owner status gate", () => {
  it("admin lock blocks every owner status change (hide·sold_out·block)", () => {
    for (const lock of ["hidden", "sold_out", "blocked"]) {
      for (const next of ["active", "hidden", "sold_out", "draft", "deleted"]) {
        const cur = lock === "blocked" ? "blocked" : lock;
        if (next === cur) continue;
        expect(
          ownerProductStatusChangeBlock({ product_status: cur, admin_status_lock: lock }, next)?.error
        ).toBe("admin_locked");
      }
    }
  });

  it("same-status resend is a no-op even while locked (form compatibility)", () => {
    expect(
      ownerProductStatusChangeBlock({ product_status: "hidden", admin_status_lock: "hidden" }, "hidden")
    ).toBeNull();
  });

  it("legacy blocked status without lock still blocked", () => {
    expect(ownerProductStatusChangeBlock({ product_status: "blocked" }, "active")?.error).toBe(
      "admin_blocked_product"
    );
  });

  it("PRD-03 rejected and re-review pending cannot go on sale; can hide", () => {
    expect(
      ownerProductStatusChangeBlock({ product_status: "hidden", admin_review_status: "rejected" }, "active")?.error
    ).toBe("admin_review_rejected");
    expect(
      ownerProductStatusChangeBlock({ product_status: "hidden", admin_review_status: "pending" }, "active")?.error
    ).toBe("admin_review_pending");
    expect(
      ownerProductStatusChangeBlock({ product_status: "hidden", admin_review_status: "pending" }, "sold_out")?.error
    ).toBe("admin_review_pending");
    expect(
      ownerProductStatusChangeBlock({ product_status: "active", admin_review_status: "pending" }, "hidden")
    ).toBeNull();
    expect(
      ownerProductStatusChangeBlock({ product_status: "hidden", admin_review_status: "approved" }, "active")
    ).toBeNull();
    expect(ownerProductStatusChangeBlock({ product_status: "hidden", admin_review_status: "none" }, "active")).toBeNull();
  });

  it("PRD-06 owner sold_out reason = manual, other statuses clear it", () => {
    expect(ownerSoldOutReasonForStatus("sold_out")).toBe("manual");
    expect(ownerSoldOutReasonForStatus("active")).toBeNull();
    expect(ownerSoldOutReasonForStatus("hidden")).toBeNull();
  });

  it("hub/form toggle lock reason priority: lock > blocked > review", () => {
    expect(ownerProductToggleLockReason({ admin_status_lock: "sold_out", admin_review_status: "pending" })).toEqual({
      kind: "admin_locked",
      lock: "sold_out",
    });
    expect(ownerProductToggleLockReason({ product_status: "blocked" })?.kind).toBe("blocked");
    expect(ownerProductToggleLockReason({ admin_review_status: "rejected" })?.kind).toBe("review_rejected");
    expect(ownerProductToggleLockReason({ product_status: "active", admin_review_status: "none" })).toBeNull();
  });

  it("missing-column detection and patch stripping (pre-migration DB fallback)", () => {
    expect(
      isMissingStoreProductLockColumnError({ message: "column store_products.admin_status_lock does not exist" })
    ).toBe(true);
    expect(
      isMissingStoreProductLockColumnError({
        message: "Could not find the 'sold_out_reason' column of 'store_products' in the schema cache",
      })
    ).toBe(true);
    expect(isMissingStoreProductLockColumnError({ message: "permission denied" })).toBe(false);
    expect(
      stripStoreProductLockColumns({ product_status: "hidden", admin_status_lock: "hidden", sold_out_reason: null })
    ).toEqual({ product_status: "hidden" });
  });
});

describe("PRD-04 discount reconcile", () => {
  it("percent-based discount follows the new price", () => {
    expect(reconcileDiscountForNewPrice(200, { discount_percent: 10, discount_price: 90 })).toEqual({
      discount_price: 180,
      discount_percent: 10,
    });
  });
  it("direct discount kept only while below new price", () => {
    expect(reconcileDiscountForNewPrice(100, { discount_price: 90 })).toEqual({ discount_price: 90, discount_percent: null });
    expect(reconcileDiscountForNewPrice(90, { discount_price: 90 })).toEqual({ discount_price: null, discount_percent: null });
  });
  it("no discount stays none", () => {
    expect(reconcileDiscountForNewPrice(100, {})).toEqual({ discount_price: null, discount_percent: null });
  });
  it("direct discount validation mirrors DB CHECK", () => {
    expect(isDirectDiscountPriceValid(100, 99)).toBe(true);
    expect(isDirectDiscountPriceValid(100, 100)).toBe(false);
    expect(isDirectDiscountPriceValid(100, 150)).toBe(false);
    expect(isDirectDiscountPriceValid(0, 0)).toBe(true);
    expect(isDirectDiscountPriceValid(100, -1)).toBe(false);
  });
});

describe("PRD-03 · PRD-05 buyer sellability (checkout = order RPC Pass1)", () => {
  const base = { product_status: "active", admin_review_status: "none", store_menu_sections: { is_hidden: false } };
  it("normal active product is sellable", () => {
    expect(storeOrderLineProductError(base)).toBeNull();
    expect(storeOrderLineProductError({ ...base, store_menu_sections: null })).toBeNull();
    expect(storeOrderLineProductError({ ...base, admin_review_status: "approved" })).toBeNull();
  });
  it("review rejected / pending → product_not_available (even if active)", () => {
    expect(storeOrderLineProductError({ ...base, admin_review_status: "pending" })).toBe("product_not_available");
    expect(storeOrderLineProductError({ ...base, admin_review_status: "rejected" })).toBe("product_not_available");
    expect(isStoreProductReviewUnsellable("pending")).toBe(true);
    expect(isStoreProductReviewUnsellable("none")).toBe(false);
  });
  it("hidden section → product_not_available (object or array embed)", () => {
    expect(storeOrderLineProductError({ ...base, store_menu_sections: { is_hidden: true } })).toBe(
      "product_not_available"
    );
    expect(storeProductBuyerVisibilityBlocked({ store_menu_sections: [{ is_hidden: true }] })).toBe(true);
  });
  it("sold_out / other status unchanged", () => {
    expect(storeOrderLineProductError({ ...base, product_status: "sold_out" })).toBe("product_sold_out");
    expect(storeOrderLineProductError({ ...base, product_status: "hidden" })).toBe("product_not_available");
  });
});

describe("PRD-07 dirty-only owner PATCH payload", () => {
  const baseline = {
    title: "A",
    summary: "s",
    price: 100,
    discount_percent: 10,
    stock_qty: 5,
    track_inventory: true,
    product_status: "active",
    menu_section_id: "sec",
    category_id: null,
    item_type: "product",
    is_owner_recommended: false,
    is_representative: false,
    sort_order: 0,
    options_json: [],
    thumbnail_url: "t.jpg",
    images_json: ["a.jpg"],
  };
  it("unchanged form sends nothing (stock/status never overwritten)", () => {
    expect(diffOwnerProductPatch(baseline, { ...baseline })).toEqual({});
  });
  it("title-only edit sends only title", () => {
    expect(diffOwnerProductPatch(baseline, { ...baseline, title: "B" })).toEqual({ title: "B" });
  });
  it("price change carries discount percent; track toggle carries stock", () => {
    expect(diffOwnerProductPatch(baseline, { ...baseline, price: 200 })).toEqual({ price: 200, discount_percent: 10 });
    expect(diffOwnerProductPatch(baseline, { ...baseline, track_inventory: false, stock_qty: 0 })).toEqual({
      track_inventory: false,
      stock_qty: 0,
    });
  });
  it("image change sends both image fields; cleared summary → null", () => {
    expect(diffOwnerProductPatch(baseline, { ...baseline, images_json: [] })).toEqual({
      thumbnail_url: "t.jpg",
      images_json: [],
    });
    expect(diffOwnerProductPatch(baseline, { ...baseline, summary: undefined })).toEqual({ summary: null });
  });
});
