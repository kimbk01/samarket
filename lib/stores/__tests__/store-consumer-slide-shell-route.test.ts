import { describe, expect, it } from "vitest";
import { shouldWrapStoreDetailSlideShell } from "@/lib/stores/store-consumer-route";

describe("shouldWrapStoreDetailSlideShell", () => {
  it("wraps store menu root only", () => {
    expect(shouldWrapStoreDetailSlideShell("/stores/aa11", "aa11")).toBe(true);
  });

  it("does not wrap cart (internal scroll shell)", () => {
    expect(shouldWrapStoreDetailSlideShell("/stores/aa11/cart", "aa11")).toBe(false);
  });

  it("does not wrap checkout", () => {
    expect(shouldWrapStoreDetailSlideShell("/stores/aa11/checkout", "aa11")).toBe(false);
  });

  it("does not wrap product detail", () => {
    expect(shouldWrapStoreDetailSlideShell("/stores/aa11/p/prod-1", "aa11")).toBe(false);
  });

  it("does not wrap owner routes", () => {
    expect(shouldWrapStoreDetailSlideShell("/stores/aa11/owner", "aa11")).toBe(false);
  });
});
