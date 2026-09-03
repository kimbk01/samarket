import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO,
  DIBAY_USABLE_AREA_SHEET_MARKER,
} from "@/lib/ui/dibay-usable-area-sheet-contract";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Dibay usable-area sheet — OPTION B shared authority", () => {
  it("defines one canonical marker and default height ratio", () => {
    expect(DIBAY_USABLE_AREA_SHEET_MARKER).toBe("data-dibay-usable-area-sheet");
    expect(DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO).toBe(0.8);
  });

  it("DibayUsableAreaSheet owns VV band + pad-only inset; does not leak raw geometry props", () => {
    const src = read("components/ui/dibay-overlay/DibayUsableAreaSheet.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("effectiveBottomInset");
    expect(src).toContain("visualViewportHeight");
    expect(src).toContain("visualViewportOffsetTop");
    expect(src).toContain("stageStyle");
    expect(src).toContain("paddingTop: \"var(--safe-top)\"");
    expect(src).toContain("paddingBottom:");
    expect(src).toContain(DIBAY_USABLE_AREA_SHEET_MARKER);
    // Semantic consumer API — no raw VV props on the public type surface
    expect(src).not.toMatch(/visualViewportHeight\?:/);
    expect(src).not.toMatch(/sheetLift/);
    expect(src).not.toMatch(/pageTop/);
  });

  it("SupportSheetShell consumes usable-area sheet only — no DibayBottomSheet / Form VV", () => {
    const shell = read("components/support/SupportSheetShell.tsx");
    expect(shell).toContain("DibayUsableAreaSheet");
    expect(shell).not.toContain("DibayBottomSheet");
    expect(shell).not.toContain("useFormKeyboardViewport");
    expect(shell).not.toContain("visualViewport");
    expect(shell).not.toContain("stageStyle");
    expect(shell).not.toContain("contentPaddingBottomPx");
  });

  it("MypageBottomSheetShell migrates off parallel portal onto usable-area sheet", () => {
    const mypage = read("components/mypage/profile-settings/MypageBottomSheetShell.tsx");
    expect(mypage).toContain("DibayUsableAreaSheet");
    expect(mypage).not.toContain("createPortal");
    expect(mypage).not.toContain("visualViewportHeight");
    expect(mypage).not.toContain("useFormKeyboardViewport");
  });

  it("DibayBottomSheet legacy path stays free of Support-specific usable-area rewrite", () => {
    const sheet = read("components/ui/dibay-overlay/DibayBottomSheet.tsx");
    expect(sheet).not.toContain("DibayUsableAreaSheet");
    expect(sheet).not.toContain("resolveSupportSheetGeometry");
    expect(sheet).toContain("heightRatio");
  });

  it("effectiveBottomInset contract remains padding-only in Form SSOT", () => {
    const contract = read("lib/ui/form-keyboard-viewport-contract.ts");
    expect(contract).toContain("resolveFormEffectiveBottomInsetPx");
    expect(contract).toMatch(/keyboardOpen[\s\S]*keyboardOcclusionInset/);
    expect(contract).toMatch(/safeBottom/);
  });
});
