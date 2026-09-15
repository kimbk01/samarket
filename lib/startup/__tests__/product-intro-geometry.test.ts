import { describe, expect, it } from "vitest";
import {
  PRODUCT_INTRO_CANONICAL_ASPECT,
  PRODUCT_INTRO_MAX_OUTPUT_BYTES,
  PRODUCT_INTRO_MAX_SOURCE_BYTES,
  computeProductIntroLayoutBox,
} from "@/lib/startup/product-intro-geometry";

describe("product-intro-geometry", () => {
  it("locks canonical 4:5 creative", () => {
    expect(PRODUCT_INTRO_CANONICAL_ASPECT).toBe("4:5");
  });

  it("separates source ceiling from optimized output ceiling", () => {
    expect(PRODUCT_INTRO_MAX_SOURCE_BYTES).toBe(8 * 1024 * 1024);
    expect(PRODUCT_INTRO_MAX_OUTPUT_BYTES).toBe(1024 * 1024);
    expect(PRODUCT_INTRO_MAX_SOURCE_BYTES).toBeGreaterThan(PRODUCT_INTRO_MAX_OUTPUT_BYTES);
  });

  it("full-surface cover fills viewport without card caps", () => {
    const phone = computeProductIntroLayoutBox({
      viewportWidth: 390,
      viewportHeight: 844,
      displayMode: "card",
      widthPercent: 72,
      objectFit: "cover",
    });
    expect(phone.surfaceWidthPx).toBe(390);
    expect(phone.surfaceMaxHeightPx).toBe(844);
    expect(phone.objectFit).toBe("cover");
  });

  it("contain remains available without card framing", () => {
    const box = computeProductIntroLayoutBox({
      viewportWidth: 390,
      viewportHeight: 844,
      displayMode: "fullscreen",
      widthPercent: 100,
      objectFit: "contain",
    });
    expect(box.objectFit).toBe("contain");
    expect(box.surfaceWidthPx).toBe(390);
  });
});
