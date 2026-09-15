import { describe, expect, it } from "vitest";
import {
  PRODUCT_INTRO_CANONICAL_ASPECT,
  PRODUCT_INTRO_POPUP_MAX_WIDTH_PX,
  computeProductIntroLayoutBox,
} from "@/lib/startup/product-intro-geometry";

describe("product-intro-geometry", () => {
  it("locks canonical 4:5 creative", () => {
    expect(PRODUCT_INTRO_CANONICAL_ASPECT).toBe("4:5");
  });

  it("popup stays bounded on phone and tablet", () => {
    const phone = computeProductIntroLayoutBox({
      viewportWidth: 390,
      viewportHeight: 844,
      displayMode: "card",
      widthPercent: 72,
      objectFit: "contain",
    });
    expect(phone.surfaceWidthPx).toBeLessThanOrEqual(PRODUCT_INTRO_POPUP_MAX_WIDTH_PX);
    expect(phone.objectFit).toBe("contain");

    const tablet = computeProductIntroLayoutBox({
      viewportWidth: 1024,
      viewportHeight: 768,
      displayMode: "card",
      widthPercent: 72,
      objectFit: "contain",
    });
    expect(tablet.surfaceWidthPx).toBe(PRODUCT_INTRO_POPUP_MAX_WIDTH_PX);
    expect(tablet.surfaceMaxHeightPx).toBeLessThanOrEqual(768);
  });

  it("fullscreen uses contain/cover from Admin without stretch override", () => {
    const box = computeProductIntroLayoutBox({
      viewportWidth: 390,
      viewportHeight: 844,
      displayMode: "fullscreen",
      widthPercent: 100,
      objectFit: "contain",
    });
    expect(box.objectFit).toBe("contain");
    expect(box.surfaceWidthPx).toBeLessThanOrEqual(390);
  });
});
