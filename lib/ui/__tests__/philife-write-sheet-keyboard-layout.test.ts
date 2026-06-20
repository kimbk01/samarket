import { describe, expect, it } from "vitest";
import {
  PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS,
  PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID,
  philifeWriteSheetOuterPaddingStyle,
  philifeWriteSheetShellStyle,
} from "@/lib/ui/philife-write-sheet-keyboard-layout";

describe("PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID", () => {
  it("is v3 (Android adjustResize + iOS kb-offset footer only)", () => {
    expect(PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID).toBe("philife-write-sheet-keyboard-v3");
  });
});

describe("PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS", () => {
  it("combines safe-bottom and kb-offset in one place", () => {
    expect(PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS).toContain("--safe-bottom");
    expect(PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS).toContain("--kb-offset");
  });
});

describe("philifeWriteSheetOuterPaddingStyle (deprecated v2)", () => {
  it("returns empty object — outer paddingBottom forbidden on Android adjustResize", () => {
    expect(philifeWriteSheetOuterPaddingStyle(280)).toEqual({});
    expect(philifeWriteSheetOuterPaddingStyle(-10)).toEqual({});
  });
});

describe("philifeWriteSheetShellStyle (legacy alias)", () => {
  it("delegates to deprecated outer padding style", () => {
    expect(philifeWriteSheetShellStyle(120, 280)).toEqual({});
  });
});
