import { describe, expect, it } from "vitest";
import {
  STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS,
  storeCommerceActionBtnClass,
  storeCommerceActionSideCtaClass,
} from "@/lib/stores/store-commerce-bottom-action-bar";

describe("storeCommerceActionSideCtaClass", () => {
  it("keeps side CTA shrinkable under 58% with overflow clip (no fixed min-width nowrap)", () => {
    const cls = storeCommerceActionSideCtaClass(false);
    expect(cls).toContain("min-w-0");
    expect(cls).toContain("max-w-[58%]");
    expect(cls).toContain("shrink");
    expect(cls).toContain("overflow-hidden");
    expect(cls).not.toMatch(/\bshrink-0\b/);
    expect(cls).not.toMatch(/min-w-\[9/);
    expect(cls).not.toContain("whitespace-nowrap");
  });

  it("disabled side CTA keeps the same layout contract", () => {
    const cls = storeCommerceActionSideCtaClass(true);
    expect(cls).toContain("min-w-0");
    expect(cls).toContain("max-w-[58%]");
    expect(cls).toContain("cursor-not-allowed");
    expect(cls).not.toMatch(/\bshrink-0\b/);
  });

  it("icon/fixed CTA helper still uses shrink-0", () => {
    expect(storeCommerceActionBtnClass(false)).toMatch(/\bshrink-0\b/);
  });

  it("exports truncate label class for CTA children", () => {
    expect(STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS).toContain("truncate");
    expect(STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS).toContain("min-w-0");
  });
});
