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
        admin_status_lock: "sold_out",
        sold_out_reason: "admin",
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
      patch: { title: "Fixed" },
    });
    expect(
      buildAdminStoreProductPatch({ action: "correct_price", memo: null, price: 150 })
    ).toEqual({
      ok: true,
      patch: { price: 150, discount_price: null, discount_percent: null },
    });
    expect(buildAdminStoreProductPatch({ action: "archive", memo: null })).toMatchObject({
      ok: true,
      patch: { product_status: "hidden" },
    });
    expect(ADMIN_STORE_PRODUCT_ACTIONS).not.toContain("create");
    expect(ADMIN_STORE_PRODUCT_ACTIONS).not.toContain("delete_forever");
  });

  it("PRD-04 correct_price recomputes the discount from the current percent", () => {
    // 정가 100 · 10% (할인가 90) → 관리자가 200 으로 정정 → 할인가 180 (90 유지 = 55% 할인 버그 방지)
    expect(
      buildAdminStoreProductPatch({
        action: "correct_price",
        memo: null,
        price: 200,
        current: { discount_percent: 10, discount_price: 90 },
      })
    ).toEqual({ ok: true, patch: { price: 200, discount_price: 180, discount_percent: 10 } });
    // percent 없이 할인가만 있고 새 가격 이하가 되면 할인 해제
    expect(
      buildAdminStoreProductPatch({
        action: "correct_price",
        memo: null,
        price: 80,
        current: { discount_percent: null, discount_price: 90 },
      })
    ).toEqual({ ok: true, patch: { price: 80, discount_price: null, discount_percent: null } });
    // percent 없이 할인가 < 새 가격이면 유지
    expect(
      buildAdminStoreProductPatch({
        action: "correct_price",
        memo: null,
        price: 120,
        current: { discount_percent: null, discount_price: 90 },
      })
    ).toEqual({ ok: true, patch: { price: 120, discount_price: 90, discount_percent: null } });
  });

  it("ND-1 hide / block / archive set the admin lock; only activate clears it", () => {
    for (const action of ["hide", "archive"] as const) {
      expect(buildAdminStoreProductPatch({ action, memo: "사유 메모" })).toMatchObject({
        ok: true,
        patch: { product_status: "hidden", admin_status_lock: "hidden", sold_out_reason: null },
      });
    }
    expect(buildAdminStoreProductPatch({ action: "block", memo: "사유 메모" })).toMatchObject({
      ok: true,
      patch: { product_status: "blocked", admin_status_lock: "blocked", admin_review_status: "rejected" },
    });
    expect(buildAdminStoreProductPatch({ action: "activate", memo: null })).toMatchObject({
      ok: true,
      patch: {
        product_status: "active",
        admin_review_status: "approved",
        admin_status_lock: null,
        sold_out_reason: null,
      },
    });
    // 검수 승인은 잠금을 풀지 않는다 (관리자 숨김·품절은 판매 재개로만 해제)
    const approve = buildAdminStoreProductPatch({ action: "approve_review", memo: null });
    expect(approve.ok && "admin_status_lock" in approve.patch).toBe(false);
  });
});
