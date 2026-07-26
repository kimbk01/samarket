import { describe, expect, it } from "vitest";
import { shouldMountStoreCommerceCartProvider } from "@/lib/layout/store-commerce-cart-mount-surfaces";

describe("shouldMountStoreCommerceCartProvider", () => {
  it("배달·주문·마이페이지 표면에서 Provider 마운트", () => {
    expect(shouldMountStoreCommerceCartProvider("/stores")).toBe(true);
    expect(shouldMountStoreCommerceCartProvider("/stores/foo/cart")).toBe(true);
    expect(shouldMountStoreCommerceCartProvider("/mypage/store-orders")).toBe(true);
    expect(shouldMountStoreCommerceCartProvider("/orders")).toBe(true);
    expect(shouldMountStoreCommerceCartProvider("/orders/store/abc")).toBe(true);
    expect(shouldMountStoreCommerceCartProvider("/my/store-orders")).toBe(true);
  });

  it("거래·커뮤니티·오너 어드민에서는 마운트 생략", () => {
    expect(shouldMountStoreCommerceCartProvider("/market")).toBe(false);
    expect(shouldMountStoreCommerceCartProvider("/philife")).toBe(false);
    expect(shouldMountStoreCommerceCartProvider("/stores/owner")).toBe(false);
    expect(shouldMountStoreCommerceCartProvider("/stores/owner/orders")).toBe(false);
  });
});
