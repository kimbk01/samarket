import { describe, expect, it } from "vitest";
import {
  buildMyProductsListingHref,
  parseMyProductPromotedOnly,
} from "@/lib/products/my-product-listing-filter";

describe("buildMyProductsListingHref", () => {
  it("builds canonical listing href with filter and promoted overlay", () => {
    expect(buildMyProductsListingHref("all", false)).toBe("/mypage/products");
    expect(buildMyProductsListingHref("active", false)).toBe("/mypage/products?filter=active");
    expect(buildMyProductsListingHref("all", true)).toBe("/mypage/products?promoted=1");
    expect(buildMyProductsListingHref("sold", true)).toBe("/mypage/products?filter=sold&promoted=1");
  });
});

describe("parseMyProductPromotedOnly", () => {
  it("parses promoted overlay query", () => {
    expect(parseMyProductPromotedOnly(null)).toBe(false);
    expect(parseMyProductPromotedOnly("1")).toBe(true);
    expect(parseMyProductPromotedOnly("true")).toBe(true);
    expect(parseMyProductPromotedOnly("0")).toBe(false);
  });
});
