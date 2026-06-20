import { describe, expect, it } from "vitest";
import {
  philifeWriteSheetOuterPaddingStyle,
  philifeWriteSheetShellStyle,
} from "@/lib/ui/philife-write-sheet-keyboard-layout";

describe("philifeWriteSheetOuterPaddingStyle", () => {
  it("applies keyboard inset as outer paddingBottom", () => {
    expect(philifeWriteSheetOuterPaddingStyle(280)).toEqual({ paddingBottom: 280 });
  });

  it("clamps negative keyboard inset to zero", () => {
    expect(philifeWriteSheetOuterPaddingStyle(-10)).toEqual({ paddingBottom: 0 });
  });
});

describe("philifeWriteSheetShellStyle (legacy alias)", () => {
  it("delegates to outer padding style", () => {
    expect(philifeWriteSheetShellStyle(120, 280)).toEqual({ paddingBottom: 280 });
  });
});
