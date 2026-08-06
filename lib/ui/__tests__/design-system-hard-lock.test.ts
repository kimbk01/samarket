import { describe, expect, it } from "vitest";
import {
  DESIGN_SYSTEM_A11Y,
  DESIGN_SYSTEM_BRAND,
  DESIGN_SYSTEM_COMPONENT_CLASSES,
  DESIGN_SYSTEM_FILE_SSOT,
} from "@/lib/ui/design-system-hard-lock";
import { MYPAGE_MOTION_MS } from "@/lib/mypage/mypage-authority-contract";

describe("design-system-hard-lock (Slice 2.5)", () => {
  it("brand is DIBAY green not karrot orange", () => {
    expect(DESIGN_SYSTEM_BRAND.primaryHex).toBe("#0B421A");
    expect(DESIGN_SYSTEM_BRAND.primaryToken).toBe("--dibay-green");
    expect(DESIGN_SYSTEM_BRAND.forbiddenBrandNotes).toContain("karrot-orange");
  });

  it("a11y touch and contrast locked", () => {
    expect(DESIGN_SYSTEM_A11Y.touchTargetMinPx).toBe(44);
    expect(DESIGN_SYSTEM_A11Y.contrastRatioMin).toBe(4.5);
    expect(DESIGN_SYSTEM_A11Y.inputFontMinPx).toBe(16);
    expect(DESIGN_SYSTEM_A11Y.focusVisibleRequired).toBe(true);
  });

  it("reduced motion collapses push/modal from Slice 2 motion", () => {
    expect(MYPAGE_MOTION_MS.push).toBe(300);
    expect(DESIGN_SYSTEM_A11Y.reducedMotionMs.push).toBe(0);
    expect(DESIGN_SYSTEM_A11Y.reducedMotionMs.modal).toBe(0);
  });

  it("component vocabulary points at Sam classes", () => {
    expect(DESIGN_SYSTEM_COMPONENT_CLASSES.btnPrimary).toBe("sam-btn-primary");
    expect(DESIGN_SYSTEM_COMPONENT_CLASSES.btnDanger).toBe("sam-btn-danger");
    expect(DESIGN_SYSTEM_FILE_SSOT.tokensCss).toBe("app/design-tokens.css");
  });
});
