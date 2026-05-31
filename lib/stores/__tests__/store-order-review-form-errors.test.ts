import { describe, expect, it } from "vitest";
import { resolveStoreOrderReviewSubmitErrorKey } from "@/lib/stores/store-order-review-form-errors";

describe("resolveStoreOrderReviewSubmitErrorKey", () => {
  it("maps known API codes to user-facing i18n keys", () => {
    expect(resolveStoreOrderReviewSubmitErrorKey("order_not_completed")).toBe(
      "mypage_comp_store_review_err_not_completed"
    );
    expect(resolveStoreOrderReviewSubmitErrorKey("review_already_exists")).toBe(
      "mypage_comp_store_review_err_exists"
    );
  });

  it("never returns raw API codes for unknown errors", () => {
    expect(resolveStoreOrderReviewSubmitErrorKey("failed")).toBe(
      "mypage_comp_store_review_save_failed_generic"
    );
    expect(resolveStoreOrderReviewSubmitErrorKey("load_failed")).toBe(
      "mypage_comp_store_review_save_failed_generic"
    );
  });
});
