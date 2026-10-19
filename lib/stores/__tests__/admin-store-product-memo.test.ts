import { describe, expect, it } from "vitest";
import { adminStoreProductMemoMissing } from "@/lib/stores/admin-store-product-ops";

describe("admin store product memo (DEF-37 server)", () => {
  it("requires a reason for block / hide / reject_review", () => {
    expect(adminStoreProductMemoMissing("block", null)).toBe(true);
    expect(adminStoreProductMemoMissing("hide", " a ")).toBe(true);
    expect(adminStoreProductMemoMissing("reject_review", "이미지 부적절")).toBe(false);
  });
  it("does not require a reason for activate / approve", () => {
    expect(adminStoreProductMemoMissing("activate", null)).toBe(false);
    expect(adminStoreProductMemoMissing("approve_review", null)).toBe(false);
  });
});
