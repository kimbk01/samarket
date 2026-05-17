import { describe, expect, it } from "vitest";
import {
  buildStoreDetailHref,
  normalizeStoreDetailHref,
  parseStoreDetailFocusProductId,
  parseStoreDetailSlugFromHref,
  storeDetailBaseHref,
} from "@/lib/dibay/store-detail-href";

describe("store-detail-href", () => {
  it("builds base and focusProduct hrefs", () => {
    expect(buildStoreDetailHref("aa11")).toBe("/stores/aa11");
    expect(buildStoreDetailHref("aa11", "prod-1")).toBe(
      "/stores/aa11?focusProduct=prod-1"
    );
  });

  it("normalizes and parses slug and focus id", () => {
    const href = "/stores/aa11?focusProduct=abc%201";
    expect(normalizeStoreDetailHref(href)).toBe("/stores/aa11?focusProduct=abc+1");
    expect(parseStoreDetailSlugFromHref(href)).toBe("aa11");
    expect(parseStoreDetailFocusProductId(href)).toBe("abc 1");
    expect(storeDetailBaseHref(href)).toBe("/stores/aa11");
  });
});
