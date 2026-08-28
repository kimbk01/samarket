import { describe, expect, it } from "vitest";
import {
  isCustomerOpaqueGiftProductTitle,
  resolveCustomerGiftProductTitle,
} from "@/lib/gift-certificate/gift-product-customer-view";

describe("gift-product-customer-view", () => {
  it("flags QA platform product titles as opaque", () => {
    expect(isCustomerOpaqueGiftProductTitle("SP PLATFORM QA 1787622130804")).toBe(true);
    expect(isCustomerOpaqueGiftProductTitle("U7 Positive Fee QA")).toBe(true);
    expect(isCustomerOpaqueGiftProductTitle("나의 오른손떡볶이 ₱30,000")).toBe(false);
  });

  it("resolves customer-facing title for opaque store products", () => {
    const r = resolveCustomerGiftProductTitle({
      title: "SP PLATFORM resume test",
      storeName: "나의 오른손떡볶이",
      giftScope: "STORE",
    });
    expect(r.titleIsCustomerOpaque).toBe(true);
    expect(r.customerTitle).toBe("나의 오른손떡볶이 상품권");
  });
});
