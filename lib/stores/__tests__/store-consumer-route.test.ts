import { describe, expect, it } from "vitest";
import {
  isStoreProductDetailConsumerPath,
  shouldWrapStoreDetailSlideShell,
} from "@/lib/stores/store-consumer-route";

describe("isStoreProductDetailConsumerPath", () => {
  it("matches product detail URL", () => {
    expect(
      isStoreProductDetailConsumerPath("/stores/jtv-4cd1e71c/p/655573cc-3826-41a6-9375-dca10119a549")
    ).toBe(true);
  });

  it("does not match store menu root", () => {
    expect(isStoreProductDetailConsumerPath("/stores/jtv-4cd1e71c")).toBe(false);
  });
});

describe("shouldWrapStoreDetailSlideShell", () => {
  it("excludes product detail from slide shell", () => {
    expect(
      shouldWrapStoreDetailSlideShell(
        "/stores/jtv-4cd1e71c/p/655573cc-3826-41a6-9375-dca10119a549",
        "jtv-4cd1e71c"
      )
    ).toBe(false);
  });
});
