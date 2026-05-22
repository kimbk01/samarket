import { describe, expect, it } from "vitest";
import { buildStoreCartBackFallbackHref } from "@/lib/stores/store-cart-back-navigation";

describe("store-cart-back-navigation", () => {
  it("buildStoreCartBackFallbackHref encodes slug", () => {
    expect(buildStoreCartBackFallbackHref("cafe a")).toBe("/stores/cafe%20a");
    expect(buildStoreCartBackFallbackHref("")).toBe("/stores");
  });
});
