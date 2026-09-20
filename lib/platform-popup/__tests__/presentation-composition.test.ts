import { describe, expect, it } from "vitest";
import {
  compositionUsesFloatingClose,
  resolvePlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";

describe("presentation composition resolution", () => {
  it("maps center_modal + artwork → artwork_modal (Type A)", () => {
    expect(
      resolvePlatformPopupComposition({
        presentationType: "center_modal",
        creativeMode: "artwork",
      })
    ).toBe("artwork_modal");
  });

  it("maps center_modal + card → promotion_card_modal (Type B)", () => {
    expect(
      resolvePlatformPopupComposition({
        presentationType: "center_modal",
        creativeMode: "card",
      })
    ).toBe("promotion_card_modal");
  });

  it("maps bottom_sheet → bottom_promotion_sheet (Type C) regardless of creative", () => {
    expect(
      resolvePlatformPopupComposition({
        presentationType: "bottom_sheet",
        creativeMode: "card",
      })
    ).toBe("bottom_promotion_sheet");
    expect(
      resolvePlatformPopupComposition({
        presentationType: "bottom_sheet",
        creativeMode: "artwork",
      })
    ).toBe("bottom_promotion_sheet");
  });

  it("floating close only on modal compositions", () => {
    expect(compositionUsesFloatingClose("artwork_modal")).toBe(true);
    expect(compositionUsesFloatingClose("promotion_card_modal")).toBe(true);
    expect(compositionUsesFloatingClose("bottom_promotion_sheet")).toBe(false);
  });
});
