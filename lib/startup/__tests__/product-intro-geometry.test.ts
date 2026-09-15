import { describe, expect, it } from "vitest";
import {
  PRODUCT_INTRO_CANONICAL_ASPECT,
  PRODUCT_INTRO_MAX_OUTPUT_BYTES,
  PRODUCT_INTRO_MAX_SOURCE_BYTES,
  PRODUCT_INTRO_V2_FIT,
  computeContainedCreativeRect,
  computeProductIntroLayoutBox,
} from "@/lib/startup/product-intro-geometry";

describe("product-intro-geometry V2", () => {
  it("locks canonical 4:5 creative recommendation", () => {
    expect(PRODUCT_INTRO_CANONICAL_ASPECT).toBe("4:5");
    expect(PRODUCT_INTRO_V2_FIT).toBe("contain");
  });

  it("separates source ceiling from optimized output ceiling", () => {
    expect(PRODUCT_INTRO_MAX_SOURCE_BYTES).toBe(8 * 1024 * 1024);
    expect(PRODUCT_INTRO_MAX_OUTPUT_BYTES).toBe(1024 * 1024);
  });

  it("layout box always CONTAIN with no card caps", () => {
    const phone = computeProductIntroLayoutBox({
      viewportWidth: 390,
      viewportHeight: 844,
      displayMode: "card",
      widthPercent: 72,
      objectFit: "cover",
    });
    expect(phone.surfaceWidthPx).toBe(390);
    expect(phone.surfaceMaxHeightPx).toBe(844);
    expect(phone.objectFit).toBe("contain");
  });

  it("contained rect preserves aspect and stays inside safe insets", () => {
    const rect = computeContainedCreativeRect({
      viewportWidth: 390,
      viewportHeight: 844,
      imageWidth: 1080,
      imageHeight: 1350,
      safeInsetPct: 8,
      sizePreset: "max",
    });
    expect(rect.objectFit).toBe("contain");
    expect(rect.width / rect.height).toBeCloseTo(1080 / 1350, 2);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.left + rect.width).toBeLessThanOrEqual(390);
    expect(rect.top + rect.height).toBeLessThanOrEqual(844);
    // Not edge-to-edge crop fill on tall phone
    expect(rect.width).toBeLessThan(390);
  });

  it("size presets scale the same centered CONTAIN rect", () => {
    const max = computeContainedCreativeRect({
      viewportWidth: 390,
      viewportHeight: 844,
      imageWidth: 1080,
      imageHeight: 1350,
      sizePreset: "max",
    });
    const small = computeContainedCreativeRect({
      viewportWidth: 390,
      viewportHeight: 844,
      imageWidth: 1080,
      imageHeight: 1350,
      sizePreset: "small",
    });

    expect(max.objectFit).toBe("contain");
    expect(small.objectFit).toBe("contain");
    expect(small.width).toBeLessThan(max.width);
    expect(Math.abs(small.left + small.width / 2 - (max.left + max.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(small.top + small.height / 2 - (max.top + max.height / 2))).toBeLessThanOrEqual(1);
  });

  it("landscape keeps full creative without width-fill zoom", () => {
    const rect = computeContainedCreativeRect({
      viewportWidth: 844,
      viewportHeight: 390,
      imageWidth: 1080,
      imageHeight: 1350,
    });
    expect(rect.height).toBeLessThanOrEqual(390);
    expect(rect.width / rect.height).toBeCloseTo(1080 / 1350, 2);
  });
});
